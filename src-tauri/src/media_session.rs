//! The media session of the system (Windows): the volume flyout, the lock screen and the media keys show the track of
//! the audio player and drive it. WebView2 has its own one, but it belongs to msedgewebview2.exe, which Windows shows as
//! "Unknown app": it is turned off (see the browser args in window.rs) and this one is published for the window of the
//! app, so Windows shows the name and the icon of EasyTask. The page calls the commands below and listens to
//! `MEDIA_ACTION_EVENT`; on the other systems the commands do nothing and the page keeps `navigator.mediaSession`.

use serde::Serialize;
use tauri::Manager;

/// Emitted to the page when a button of the system is pressed or the system asks for another position.
#[cfg_attr(not(windows), allow(dead_code))]
pub const MEDIA_ACTION_EVENT: &str = "media-session-action";

#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAction {
    /// play, pause, stop, seekbackward, seekforward or seekto
    pub action: &'static str,
    /// Seconds, only for seekto.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seek_time: Option<f64>,
}

#[cfg(windows)]
mod platform {
    use super::{MediaAction, MEDIA_ACTION_EVENT};
    use std::sync::Mutex;
    use tauri::{Emitter, Manager};
    use windows::Foundation::{TimeSpan, TypedEventHandler};
    use windows::Media::{
        MediaPlaybackStatus, MediaPlaybackType, PlaybackPositionChangeRequestedEventArgs,
        SystemMediaTransportControls, SystemMediaTransportControlsButton,
        SystemMediaTransportControlsButtonPressedEventArgs,
        SystemMediaTransportControlsTimelineProperties,
    };
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

    pub struct MediaSession(Mutex<Option<SystemMediaTransportControls>>);

    /// 100-nanosecond ticks of a TimeSpan.
    fn span(seconds: f64) -> TimeSpan {
        let seconds = if seconds.is_finite() && seconds > 0.0 {
            seconds
        } else {
            0.0
        };
        TimeSpan {
            Duration: (seconds * 10_000_000.0) as i64,
        }
    }

    fn controls_for(app: &tauri::AppHandle) -> windows::core::Result<SystemMediaTransportControls> {
        let window = app.get_webview_window("main").ok_or_else(|| {
            windows::core::Error::from_hresult(windows::Win32::Foundation::E_FAIL)
        })?;
        let hwnd = window
            .hwnd()
            .map_err(|_| windows::core::Error::from_hresult(windows::Win32::Foundation::E_FAIL))?;
        let interop = windows::core::factory::<
            SystemMediaTransportControls,
            ISystemMediaTransportControlsInterop,
        >()?;
        // SAFETY: the handle is the live window of the app
        let controls: SystemMediaTransportControls = unsafe { interop.GetForWindow(HWND(hwnd.0))? };

        controls.SetIsPlayEnabled(true)?;
        controls.SetIsPauseEnabled(true)?;
        controls.SetIsStopEnabled(true)?;
        // The previous/next buttons of the flyout skip back and forward, like the buttons of the player
        controls.SetIsPreviousEnabled(true)?;
        controls.SetIsNextEnabled(true)?;
        controls.SetIsEnabled(false)?;

        let emitter = app.clone();
        controls.ButtonPressed(&TypedEventHandler::<
            SystemMediaTransportControls,
            SystemMediaTransportControlsButtonPressedEventArgs,
        >::new(move |_, args| {
            let Some(args) = args.as_ref() else {
                return Ok(());
            };
            let button = args.Button()?;
            let action = match button {
                SystemMediaTransportControlsButton::Play => "play",
                SystemMediaTransportControlsButton::Pause => "pause",
                SystemMediaTransportControlsButton::Stop => "stop",
                SystemMediaTransportControlsButton::Previous
                | SystemMediaTransportControlsButton::Rewind => "seekbackward",
                SystemMediaTransportControlsButton::Next
                | SystemMediaTransportControlsButton::FastForward => "seekforward",
                _ => return Ok(()),
            };
            let _ = emitter.emit(
                MEDIA_ACTION_EVENT,
                MediaAction {
                    action,
                    seek_time: None,
                },
            );
            Ok(())
        }))?;

        let emitter = app.clone();
        controls.PlaybackPositionChangeRequested(&TypedEventHandler::<
            SystemMediaTransportControls,
            PlaybackPositionChangeRequestedEventArgs,
        >::new(move |_, args| {
            let Some(args) = args.as_ref() else {
                return Ok(());
            };
            let position = args.RequestedPlaybackPosition()?;
            let _ = emitter.emit(
                MEDIA_ACTION_EVENT,
                MediaAction {
                    action: "seekto",
                    seek_time: Some(position.Duration as f64 / 10_000_000.0),
                },
            );
            Ok(())
        }))?;

        Ok(controls)
    }

    impl MediaSession {
        pub fn new() -> Self {
            Self(Mutex::new(None))
        }

        /// Runs `f` on the controls of the window, created on first use.
        fn with<T>(
            &self,
            app: &tauri::AppHandle,
            f: impl FnOnce(&SystemMediaTransportControls) -> windows::core::Result<T>,
        ) -> Result<T, String> {
            // A poisoned lock only means another call panicked: the Option inside is still valid
            let mut guard = self
                .0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if guard.is_none() {
                *guard = Some(controls_for(app).map_err(|e| e.to_string())?);
            }
            let controls = guard
                .as_ref()
                .ok_or_else(|| "the media session is not available".to_string())?;
            f(controls).map_err(|e| e.to_string())
        }

        pub fn update(
            &self,
            app: &tauri::AppHandle,
            title: &str,
            artist: &str,
            playing: bool,
        ) -> Result<(), String> {
            self.with(app, |controls| {
                let updater = controls.DisplayUpdater()?;
                updater.SetType(MediaPlaybackType::Music)?;
                let music = updater.MusicProperties()?;
                music.SetTitle(&title.into())?;
                music.SetArtist(&artist.into())?;
                updater.Update()?;
                controls.SetPlaybackStatus(if playing {
                    MediaPlaybackStatus::Playing
                } else {
                    MediaPlaybackStatus::Paused
                })?;
                controls.SetIsEnabled(true)
            })
        }

        pub fn timeline(
            &self,
            app: &tauri::AppHandle,
            position: f64,
            duration: f64,
        ) -> Result<(), String> {
            self.with(app, |controls| {
                let timeline = SystemMediaTransportControlsTimelineProperties::new()?;
                timeline.SetStartTime(span(0.0))?;
                timeline.SetMinSeekTime(span(0.0))?;
                timeline.SetEndTime(span(duration))?;
                timeline.SetMaxSeekTime(span(duration))?;
                timeline.SetPosition(span(position.min(duration.max(0.0))))?;
                controls.UpdateTimelineProperties(&timeline)
            })
        }

        pub fn clear(&self, app: &tauri::AppHandle) -> Result<(), String> {
            self.with(app, |controls| {
                controls.DisplayUpdater()?.ClearAll()?;
                controls.SetPlaybackStatus(MediaPlaybackStatus::Closed)?;
                controls.SetIsEnabled(false)
            })
        }
    }
}

/// Other systems: the same methods, which do nothing (the page keeps `navigator.mediaSession`).
#[cfg(not(windows))]
mod platform {
    #[derive(Default)]
    pub struct MediaSession;

    impl MediaSession {
        pub fn new() -> Self {
            Self
        }

        pub fn update(
            &self,
            _app: &tauri::AppHandle,
            _title: &str,
            _artist: &str,
            _playing: bool,
        ) -> Result<(), String> {
            Ok(())
        }

        pub fn timeline(
            &self,
            _app: &tauri::AppHandle,
            _position: f64,
            _duration: f64,
        ) -> Result<(), String> {
            Ok(())
        }

        pub fn clear(&self, _app: &tauri::AppHandle) -> Result<(), String> {
            Ok(())
        }
    }
}

pub use platform::MediaSession;

/// Whether the commands below publish the session (the page then leaves `navigator.mediaSession` alone).
#[tauri::command]
pub fn media_session_native() -> bool {
    cfg!(windows)
}

/// Shows the track and whether it is playing.
#[tauri::command]
pub fn media_session_update(
    app: tauri::AppHandle,
    title: String,
    artist: String,
    playing: bool,
) -> Result<(), String> {
    app.state::<MediaSession>()
        .update(&app, &title, &artist, playing)
}

/// Position and length of the track, in seconds.
#[tauri::command]
pub fn media_session_timeline(
    app: tauri::AppHandle,
    position: f64,
    duration: f64,
) -> Result<(), String> {
    app.state::<MediaSession>()
        .timeline(&app, position, duration)
}

/// Removes the session (the player was closed).
#[tauri::command]
pub fn media_session_clear(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<MediaSession>().clear(&app)
}
