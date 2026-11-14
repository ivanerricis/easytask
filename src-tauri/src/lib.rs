mod audio;
mod db;
mod files;
mod media_session;
mod paths;
mod settings;
#[cfg(test)]
mod test_support;
mod transfer_zip;
mod window;

use paths::{locate_data_dir, portable_install, DATA_DIR_ENV};
use settings::{
    custom_backup_folder_from, read_settings, setting_bool_from, theme_background_from,
    ALWAYS_ON_TOP_KEY, REMEMBER_WINDOW_STATE_KEY,
};
use tauri::Manager;
use tauri_plugin_fs::FsExt;
use window::{single_instance_enabled, window_state_filename};

/// Log files rotate at this size and this many are kept.
const LOG_MAX_FILE_SIZE: u128 = 1_000_000;
const LOG_FILES_KEPT: usize = 5;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    #[cfg(windows)]
    window::set_app_user_model_id(&context.config().identifier);
    let mut builder = tauri::Builder::default();
    // Must be the first plugin. A second launch focuses the window of the running instance.
    #[cfg(desktop)]
    if single_instance_enabled(
        cfg!(debug_assertions),
        std::env::var_os(DATA_DIR_ENV).is_some(),
    ) {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }
    // The plugin stores .window-state.json in the user profile, outside the portable folder, so it is
    // skipped in portable mode. It still saves the state of the main window when the app closes, but does not
    // restore it by itself: the setup does, when the "remember the window" setting is on.
    if !portable_install() {
        builder = builder.plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filename(window_state_filename(
                    std::env::var(DATA_DIR_ENV).ok().as_deref(),
                ))
                .skip_initial_state("main")
                .build(),
        );
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let info = match locate_data_dir(app.handle()) {
                Ok(info) => info,
                Err(error) => {
                    // Show the reason instead of exiting silently. The non-blocking dialog is queued on the
                    // main thread (a blocking one would deadlock here, the event loop is not running yet).
                    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                    let handle = app.handle().clone();
                    app.dialog()
                        .message(format!("EasyTask cannot start.\n\n{error}"))
                        .title("EasyTask")
                        .kind(MessageDialogKind::Error)
                        .show(move |_| handle.exit(1));
                    return Ok(());
                }
            };

            // The settings file is read once and shared by the startup steps below
            let settings = read_settings(&info.path);

            // Runtime scope of the fs plugin limited to the data folder (no global scope in the capabilities).
            // The asset protocol gets no folder: the webview only streams user-linked audio, images and videos, and
            // each one is allowed by allow_audio_file / allow_media_file (also the ones extracted by import_zip into
            // <data>/media), so the database and the settings are not readable through asset URLs.
            app.fs_scope().allow_directory(&info.path, true)?;
            // The custom backup folder (if any): only the folder itself, not its subfolders. When the user picks a
            // new one the dialog plugin adds it to the scope for the current session.
            if let Some(folder) = custom_backup_folder_from(settings.as_ref()) {
                app.fs_scope().allow_directory(&folder, false)?;
            }

            // File logging (rotated by size) in <data>/logs, also in release builds.
            let mut log = tauri_plugin_log::Builder::default()
                .clear_targets()
                .level(log::LevelFilter::Info)
                .max_file_size(LOG_MAX_FILE_SIZE)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(LOG_FILES_KEPT))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Folder {
                        path: info.path.join("logs"),
                        file_name: Some("easytask".to_string()),
                    },
                ));
            if cfg!(debug_assertions) {
                log = log.target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ));
            }
            app.handle().plugin(log.build())?;
            log::info!(
                "data folder: {} (portable: {})",
                info.path.display(),
                info.portable
            );

            // The main window is created here (create: false in tauri.conf.json) so that, in portable mode,
            // WebView2 keeps its user data folder inside the data folder.
            let config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or("no window configured")?;
            let mut window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
            // The arguments of WebView2 are read when the webview is created: the hardware acceleration setting
            // applies at the next start
            #[cfg(windows)]
            {
                window = window.additional_browser_args(&window::webview_browser_args(
                    setting_bool_from(settings.as_ref(), settings::HARDWARE_ACCELERATION_KEY, true),
                ));
            }
            #[cfg(windows)]
            if info.portable {
                window = window.data_directory(info.path.join("webview"));
            }
            if let Some((red, green, blue)) = theme_background_from(settings.as_ref()) {
                window = window.background_color(tauri::window::Color(red, green, blue, 255));
            }
            if setting_bool_from(settings.as_ref(), ALWAYS_ON_TOP_KEY, false) {
                window = window.always_on_top(true);
            }
            // Without the plugin (portable mode) there is no state to restore
            let restore_state = !info.portable
                && setting_bool_from(settings.as_ref(), REMEMBER_WINDOW_STATE_KEY, true);
            if restore_state {
                // Hidden until the saved position and size are applied, or it would flash at the default place
                window = window.visible(false);
            }
            let window = window.build()?;
            if restore_state {
                use tauri_plugin_window_state::{StateFlags, WindowExt};
                if let Err(error) = window.restore_state(StateFlags::all() - StateFlags::VISIBLE) {
                    log::warn!("cannot restore the window state: {error}");
                }
                window.show()?;
            }

            // Updater: registered at runtime (desktop only). The public key comes from tauri.conf.json; while it
            // is still the placeholder the plugin loads fine and `check()` fails with a handled error.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // Start with the system: registered but never enabled by the app, the user turns it on in the settings.
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))?;

            app.manage(info);
            app.manage(media_session::MediaSession::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            files::audio_file_exists,
            files::allow_audio_file,
            files::allow_media_file,
            files::open_media_file,
            files::files_exist,
            transfer_zip::linked_files_size,
            transfer_zip::export_zip,
            transfer_zip::import_zip,
            transfer_zip::delete_extracted_files,
            audio::audio_metadata,
            db::db_transaction,
            paths::data_dir,
            paths::is_portable,
            paths::data_dir_in_onedrive,
            paths::open_data_folder,
            media_session::media_session_native,
            media_session::media_session_update,
            media_session::media_session_timeline,
            media_session::media_session_clear
        ])
        .run(context)
        .expect("error while running tauri application");
}
