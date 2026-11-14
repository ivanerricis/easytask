//! Settings the backend reads at startup from the settings file of the data folder (the store of the app).

use std::path::{Path, PathBuf};

/// Settings file of tauri-plugin-store (the same the JS side loads in src/lib/store/initStore.ts) and the key
/// holding the custom backup folder.
pub(crate) const SETTINGS_FILE: &str = "settings.dat";
pub(crate) const BACKUP_FOLDER_KEY: &str = "backupFolder";
/// Keys of the booleans read at startup, written by the settings (APP_PREFS in src/lib/store/preferences.ts):
/// keep the names identical on both sides.
pub(crate) const REMEMBER_WINDOW_STATE_KEY: &str = "rememberWindowState";
pub(crate) const ALWAYS_ON_TOP_KEY: &str = "alwaysOnTop";
/// Background of the active theme, "#rrggbb" (written by the frontend at every theme change, src/lib/theme-startup.ts):
/// it is the color of the window before the page paints, so the start has no white flash.
const THEME_BACKGROUND_KEY: &str = "themeBackground";
// Only the Windows webview (WebView2) takes browser arguments
#[cfg(windows)]
pub(crate) const HARDWARE_ACCELERATION_KEY: &str = "hardwareAcceleration";

/// The settings file of the data folder (the store of the app), parsed. None when it is missing or not valid JSON.
pub(crate) fn read_settings(data_dir: &Path) -> Option<serde_json::Value> {
    let content = std::fs::read(data_dir.join(SETTINGS_FILE)).ok()?;
    serde_json::from_slice(&content).ok()
}

/// A boolean setting from the settings file of the data folder; `default` when the file, the key or a boolean
/// value is missing. The keys are the ones of the JS side (src/lib/store/preferences.ts): keep them identical.
#[cfg(test)]
fn setting_bool(data_dir: &Path, key: &str, default: bool) -> bool {
    setting_bool_from(read_settings(data_dir).as_ref(), key, default)
}

/// Like `setting_bool`, on settings already read (the startup reads the file once and passes the value around).
pub(crate) fn setting_bool_from(
    settings: Option<&serde_json::Value>,
    key: &str,
    default: bool,
) -> bool {
    settings
        .and_then(|settings| settings.get(key)?.as_bool())
        .unwrap_or(default)
}

/// The background of the active theme as (red, green, blue), from the settings already read. None when the key is
/// missing or is not a "#rrggbb" color (the default color of the window is kept then).
pub(crate) fn theme_background_from(settings: Option<&serde_json::Value>) -> Option<(u8, u8, u8)> {
    let hex = settings?
        .get(THEME_BACKGROUND_KEY)?
        .as_str()?
        .strip_prefix('#')?;
    if hex.len() != 6 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let channel = |range: std::ops::Range<usize>| u8::from_str_radix(&hex[range], 16).ok();
    Some((channel(0..2)?, channel(2..4)?, channel(4..6)?))
}

/// The custom backup folder chosen in the settings, read from the settings file of the data folder. None when
/// there is none, or when it is not an existing absolute folder (the default folder is used then).
pub(crate) fn custom_backup_folder(data_dir: &Path) -> Option<PathBuf> {
    custom_backup_folder_from(read_settings(data_dir).as_ref())
}

/// Like `custom_backup_folder`, on settings already read.
pub(crate) fn custom_backup_folder_from(settings: Option<&serde_json::Value>) -> Option<PathBuf> {
    let folder = PathBuf::from(settings?.get(BACKUP_FOLDER_KEY)?.as_str()?.trim());
    (folder.is_absolute() && folder.is_dir()).then_some(folder)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::temp_dir;
    use serde_json::json;

    #[test]
    fn custom_backup_folder_needs_an_existing_absolute_folder() {
        let data = temp_dir("cbf-data");
        assert_eq!(custom_backup_folder(&data), None);
        let target = temp_dir("cbf-target");
        let write = |value: serde_json::Value| {
            std::fs::write(
                data.join(SETTINGS_FILE),
                json!({ BACKUP_FOLDER_KEY: value }).to_string(),
            )
            .unwrap()
        };
        write(json!(target.to_str().unwrap()));
        assert_eq!(custom_backup_folder(&data), Some(target.clone()));
        write(json!(null));
        assert_eq!(custom_backup_folder(&data), None);
        write(json!("relative/folder"));
        assert_eq!(custom_backup_folder(&data), None);
        write(json!(target.join("missing").to_str().unwrap()));
        assert_eq!(custom_backup_folder(&data), None);
        std::fs::write(data.join(SETTINGS_FILE), b"not json").unwrap();
        assert_eq!(custom_backup_folder(&data), None);
    }

    #[test]
    fn theme_background_needs_a_six_digit_hex_color() {
        let read = |value: serde_json::Value| theme_background_from(Some(&value));
        assert_eq!(
            read(json!({ "themeBackground": "#1b1b1b" })),
            Some((27, 27, 27))
        );
        assert_eq!(
            read(json!({ "themeBackground": "#FFFFFF" })),
            Some((255, 255, 255))
        );
        assert_eq!(read(json!({ "themeBackground": "#fff" })), None);
        assert_eq!(read(json!({ "themeBackground": "1b1b1b" })), None);
        assert_eq!(read(json!({ "themeBackground": "#gggggg" })), None);
        assert_eq!(read(json!({ "themeBackground": "#+12345" })), None);
        assert_eq!(read(json!({ "themeBackground": 5 })), None);
        assert_eq!(read(json!({})), None);
        assert_eq!(theme_background_from(None), None);
    }

    #[test]
    fn setting_bool_reads_a_boolean_or_gives_the_default() {
        let data = temp_dir("sb-data");
        // No settings file
        assert!(setting_bool(&data, "rememberWindowState", true));
        assert!(!setting_bool(&data, "alwaysOnTop", false));
        let write = |value: serde_json::Value| {
            std::fs::write(data.join(SETTINGS_FILE), value.to_string()).unwrap()
        };
        write(json!({ "rememberWindowState": false, "alwaysOnTop": true }));
        assert!(!setting_bool(&data, "rememberWindowState", true));
        assert!(setting_bool(&data, "alwaysOnTop", false));
        // Missing key, or a value that is not a boolean
        write(json!({ "alwaysOnTop": "yes", "other": 1 }));
        assert!(setting_bool(&data, "rememberWindowState", true));
        assert!(!setting_bool(&data, "alwaysOnTop", false));
        assert!(setting_bool(&data, "alwaysOnTop", true));
        // Broken file
        std::fs::write(data.join(SETTINGS_FILE), b"not json").unwrap();
        assert!(setting_bool(&data, "rememberWindowState", true));
        assert!(!setting_bool(&data, "alwaysOnTop", false));
    }
}
