//! Startup decisions about the process and its window: single instance, window state file, WebView2 arguments,
//! Windows app identity.

use std::path::PathBuf;

/// The arguments of the WebView2 browser process. The media session of WebView2 belongs to msedgewebview2.exe, which
/// Windows shows as "Unknown app": it is turned off (HardwareMediaKeyHandling) and the app publishes its own one
/// (media_session.rs). The other features are the defaults of wry, which this list replaces. Without hardware
/// acceleration (setting of the user, for graphics problems) the GPU is not used.
#[cfg(windows)]
pub(crate) fn webview_browser_args(hardware_acceleration: bool) -> String {
    let mut args = String::from(
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,HardwareMediaKeyHandling",
    );
    if !hardware_acceleration {
        args.push_str(" --disable-gpu");
    }
    args
}

/// Whether the single-instance lock applies. Only release builds on the default data folder take it:
/// a debug build (`tauri dev`, e2e) or an `EASYTASK_DATA_DIR` override uses its own data, so it must be able to
/// run next to the installed app instead of exiting immediately.
pub(crate) fn single_instance_enabled(debug_build: bool, data_dir_override: bool) -> bool {
    !debug_build && !data_dir_override
}

/// File of the window state of the plugin. By default it is `.window-state.json` in the user profile (the plugin joins the
/// name to the app config folder); with an `EASYTASK_DATA_DIR` override it is a file inside that folder, so the e2e runs (and
/// any other run with its own data) neither read nor overwrite the window of the installed app. An absolute path replaces the
/// config folder in the join, which is how the plugin takes it. A relative or empty override is ignored here (the data folder
/// resolution reports it).
pub(crate) fn window_state_filename(data_dir_override: Option<&str>) -> String {
    data_dir_override
        .map(str::trim)
        .map(PathBuf::from)
        .filter(|dir| dir.is_absolute())
        .map(|dir| {
            dir.join(".window-state.json")
                .to_string_lossy()
                .into_owned()
        })
        .unwrap_or_else(|| tauri_plugin_window_state::DEFAULT_FILENAME.to_string())
}

/// Gives the process the identity of the installed app (the identifier of the bundle, the same of its Start menu
/// shortcut). Without it Windows shows "Unknown app" in the media overlay (volume flyout, lock screen) while a sound plays.
#[cfg(windows)]
pub(crate) fn set_app_user_model_id(identifier: &str) {
    let id = windows::core::HSTRING::from(identifier);
    // SAFETY: `id` is a null-terminated UTF-16 string that outlives the call
    let _ = unsafe { windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(&id) };
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::temp_dir;

    #[cfg(windows)]
    #[test]
    fn webview_args_turn_the_gpu_off_only_without_hardware_acceleration() {
        assert!(!webview_browser_args(true).contains("--disable-gpu"));
        assert!(webview_browser_args(false).contains("--disable-gpu"));
        assert!(webview_browser_args(false).contains("HardwareMediaKeyHandling"));
    }

    #[test]
    fn single_instance_only_for_release_builds_on_the_default_data_folder() {
        assert!(single_instance_enabled(false, false));
        assert!(!single_instance_enabled(true, false));
        assert!(!single_instance_enabled(false, true));
        assert!(!single_instance_enabled(true, true));
    }

    #[test]
    fn window_state_stays_in_the_profile_without_an_override() {
        assert_eq!(
            window_state_filename(None),
            tauri_plugin_window_state::DEFAULT_FILENAME
        );
        assert_eq!(
            window_state_filename(Some("  ")),
            tauri_plugin_window_state::DEFAULT_FILENAME
        );
        assert_eq!(
            window_state_filename(Some("relative/dir")),
            tauri_plugin_window_state::DEFAULT_FILENAME
        );
    }

    #[test]
    fn window_state_moves_into_the_data_dir_override() {
        let dir = temp_dir("window-state");
        let name = window_state_filename(Some(dir.to_str().unwrap()));
        let path = PathBuf::from(&name);
        assert_eq!(path, dir.join(".window-state.json"));
        // joined to any config folder it still resolves to the file in the override
        assert_eq!(std::env::temp_dir().join("config").join(&name), path);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
