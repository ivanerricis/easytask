//! The data folder: where it is (installed, portable, `EASYTASK_DATA_DIR` override), the commands that tell the
//! UI about it and the one that opens it in the file manager.

use crate::settings::custom_backup_folder;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Marker file: when it sits next to the executable the app runs in portable mode.
const PORTABLE_MARKER: &str = "portable.txt";
/// Environment variable that overrides the data folder (used by the e2e tests).
pub(crate) const DATA_DIR_ENV: &str = "EASYTASK_DATA_DIR";
/// Name of the data folder inside the user's Documents folder (installed mode).
const APP_FOLDER: &str = "EasyTask";
/// Subfolders of the data folder the UI is allowed to open in the file manager.
const OPENABLE_SUBFOLDERS: [&str; 2] = ["backups", "logs"];
/// Name of the "backups" subfolder, which the user can move elsewhere (the `backupFolder` preference).
const BACKUPS_SUBFOLDER: &str = "backups";

/// Where the app keeps its data and whether it runs in portable mode.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DataDirInfo {
    pub(crate) path: PathBuf,
    pub(crate) portable: bool,
}

/// Decides the data folder. Priority: the `EASYTASK_DATA_DIR` override (portable only if `portable.txt`
/// exists), then `<exe folder>/data` when `portable.txt` sits next to the executable, then `<Documents>/EasyTask`.
fn resolve_data_dir(
    env_dir: Option<&str>,
    exe_dir: &Path,
    documents: &Path,
) -> Result<DataDirInfo, String> {
    let portable = is_portable_install(exe_dir);
    let path = match env_dir.map(str::trim).filter(|dir| !dir.is_empty()) {
        Some(dir) => {
            let dir = PathBuf::from(dir);
            // A relative path would depend on the working directory the app was launched from
            if !dir.is_absolute() {
                return Err(format!(
                    "{DATA_DIR_ENV} must be an absolute path, got \"{}\"",
                    dir.display()
                ));
            }
            dir
        }
        None if portable => exe_dir.join("data"),
        None => documents.join(APP_FOLDER),
    };
    Ok(DataDirInfo { path, portable })
}

/// True when `portable.txt` sits next to the executable.
fn is_portable_install(exe_dir: &Path) -> bool {
    exe_dir.join(PORTABLE_MARKER).is_file()
}

/// True when the path has a component that starts with "OneDrive" (case-insensitive), e.g.
/// `C:\Users\me\OneDrive\Documents` or `C:\Users\me\OneDrive - Contoso\Documents`.
fn path_in_onedrive(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .map(|name| name.to_ascii_lowercase().starts_with("onedrive"))
            .unwrap_or(false)
    })
}

/// Resolves the data folder for the running app and creates it when missing.
pub(crate) fn locate_data_dir(app: &tauri::AppHandle) -> Result<DataDirInfo, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("cannot locate the executable: {error}"))?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| "the executable has no parent folder".to_string())?;
    // Minimal Linux setups (containers, CI runners) have no Documents folder: fall back to the app data folder
    // instead of failing the whole startup
    let documents = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|error| format!("cannot locate the Documents or the app data folder: {error}"))?;
    let env_dir = std::env::var(DATA_DIR_ENV).ok();
    let info = resolve_data_dir(env_dir.as_deref(), exe_dir, &documents)?;
    std::fs::create_dir_all(&info.path).map_err(|error| {
        format!(
            "cannot create the data folder {}: {error}",
            info.path.display()
        )
    })?;
    Ok(info)
}

/// Portable mode as seen before the app exists (plugins are registered first).
pub(crate) fn portable_install() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(is_portable_install))
        .unwrap_or(false)
}

/// Absolute path of the data folder (database, settings, backups, logs). Created at startup.
#[tauri::command]
pub(crate) fn data_dir(info: tauri::State<'_, DataDirInfo>) -> String {
    info.path.to_string_lossy().into_owned()
}

/// True when the data folder is synced by OneDrive (Windows only): SQLite files in a synced folder can hit
/// "database is locked" errors or conflicted copies.
#[tauri::command]
pub(crate) fn data_dir_in_onedrive(info: tauri::State<'_, DataDirInfo>) -> bool {
    cfg!(windows) && path_in_onedrive(&info.path)
}

/// True when the app runs in portable mode (`portable.txt` next to the executable).
#[tauri::command]
pub(crate) fn is_portable(info: tauri::State<'_, DataDirInfo>) -> bool {
    info.portable
}

/// Opens the data folder (or one of its allowed subfolders) in the file manager. The "backups" subfolder resolves
/// to the custom backup folder when one is set; the UI never passes a path.
/// The file system work runs outside the UI thread.
#[tauri::command]
pub(crate) async fn open_data_folder(
    app: tauri::AppHandle,
    info: tauri::State<'_, DataDirInfo>,
    subfolder: Option<String>,
) -> Result<(), String> {
    let data_path = info.path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        open_data_folder_blocking(&app, data_path, subfolder)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn open_data_folder_blocking(
    app: &tauri::AppHandle,
    data_path: PathBuf,
    subfolder: Option<String>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let mut target = data_path.clone();
    if let Some(name) = subfolder {
        if !OPENABLE_SUBFOLDERS.contains(&name.as_str()) {
            return Err("folder not allowed".to_string());
        }
        match custom_backup_folder(&data_path).filter(|_| name == BACKUPS_SUBFOLDER) {
            Some(custom) => target = custom,
            None => {
                target.push(name);
                std::fs::create_dir_all(&target).map_err(|error| error.to_string())?;
            }
        }
    }
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::temp_dir;

    #[test]
    fn data_dir_defaults_to_documents_folder() {
        let exe = temp_dir("dd-exe-plain");
        let docs = temp_dir("dd-docs-plain");
        let info = resolve_data_dir(None, &exe, &docs).unwrap();
        assert_eq!(info.path, docs.join("EasyTask"));
        assert!(!info.portable);
    }

    #[test]
    fn data_dir_is_next_to_the_executable_in_portable_mode() {
        let exe = temp_dir("dd-exe-portable");
        std::fs::write(exe.join("portable.txt"), b"").unwrap();
        let info = resolve_data_dir(None, &exe, &temp_dir("dd-docs-portable")).unwrap();
        assert_eq!(info.path, exe.join("data"));
        assert!(info.portable);
    }

    #[test]
    fn data_dir_env_override_wins_and_is_not_portable() {
        let exe = temp_dir("dd-exe-env");
        let custom = temp_dir("dd-custom");
        let info = resolve_data_dir(
            Some(custom.to_str().unwrap()),
            &exe,
            &temp_dir("dd-docs-env"),
        )
        .unwrap();
        assert_eq!(info.path, custom);
        assert!(!info.portable);
    }

    #[test]
    fn data_dir_env_override_keeps_portable_flag_with_marker() {
        let exe = temp_dir("dd-exe-env-marker");
        std::fs::write(exe.join("portable.txt"), b"").unwrap();
        let custom = temp_dir("dd-custom-marker");
        let info = resolve_data_dir(
            Some(custom.to_str().unwrap()),
            &exe,
            &temp_dir("dd-docs-env-marker"),
        )
        .unwrap();
        assert_eq!(info.path, custom);
        assert!(info.portable);
    }

    #[test]
    fn data_dir_blank_env_is_ignored() {
        let exe = temp_dir("dd-exe-blank");
        let docs = temp_dir("dd-docs-blank");
        let info = resolve_data_dir(Some("  "), &exe, &docs).unwrap();
        assert_eq!(info.path, docs.join("EasyTask"));
    }

    #[test]
    fn data_dir_env_relative_path_is_rejected() {
        let exe = temp_dir("dd-exe-relative");
        let docs = temp_dir("dd-docs-relative");
        for dir in ["data", "./data", "..\\data"] {
            let error = resolve_data_dir(Some(dir), &exe, &docs).unwrap_err();
            assert!(error.contains(DATA_DIR_ENV), "{error}");
        }
    }

    #[test]
    fn portable_install_needs_the_marker_file() {
        let exe = temp_dir("pi-exe");
        assert!(!is_portable_install(&exe));
        std::fs::write(exe.join("portable.txt"), b"").unwrap();
        assert!(is_portable_install(&exe));
    }

    #[test]
    fn onedrive_paths_are_detected_by_component() {
        for path in [
            "C:\\Users\\me\\OneDrive\\Documents\\EasyTask",
            "C:\\Users\\me\\OneDrive - Contoso\\Documents",
            "/home/me/onedrive/EasyTask",
        ] {
            // Backslashes are only separators on Windows: build the path from components instead
            let built: PathBuf = path.split(['\\', '/']).collect();
            assert!(path_in_onedrive(&built), "{path}");
        }
        for path in ["/home/me/Documents/EasyTask", "/home/me/MyOneDrive/x"] {
            assert!(!path_in_onedrive(Path::new(path)), "{path}");
        }
    }
}
