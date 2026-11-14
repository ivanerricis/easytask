//! The audio, image and video files linked to groups: existence checks, the per-file grant of the asset protocol
//! and opening them with the default app of the system.

use std::path::Path;
use tauri::Manager;

/// Extensions (lowercase) of the audio files the app is allowed to check and play.
/// Keep in sync with AUDIO_EXTENSIONS in src/db/queries/audio.ts.
pub(crate) const AUDIO_EXTENSIONS: [&str; 8] =
    ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "webm"];

/// Extensions (lowercase) of the images and videos that can be linked to a group.
/// Keep in sync with MEDIA_EXTENSIONS in src/db/queries/media.ts.
pub(crate) const MEDIA_EXTENSIONS: [&str; 11] = [
    "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "mp4", "webm", "mov", "m4v",
];

/// True when the path has one of the given extensions (case insensitive).
pub(crate) fn has_extension(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| allowed.contains(&extension.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// True when the path is an existing regular file with an allowed audio extension.
pub(crate) fn is_audio_file(path: &str) -> bool {
    let path = Path::new(path);
    has_extension(path, &AUDIO_EXTENSIONS) && path.is_file()
}

/// True when the path is an existing regular file with an allowed image or video extension.
fn is_media_file(path: &str) -> bool {
    let path = Path::new(path);
    has_extension(path, &MEDIA_EXTENSIONS) && path.is_file()
}

/// True when the path is an existing regular file with an audio, image or video extension.
pub(crate) fn is_linked_file(path: &str) -> bool {
    let path = Path::new(path);
    (has_extension(path, &AUDIO_EXTENSIONS) || has_extension(path, &MEDIA_EXTENSIONS))
        && path.is_file()
}

/// Tells whether an audio file is still where the database says it is.
/// Only files with an audio extension are considered, so the command cannot be used to probe other paths.
#[tauri::command]
pub(crate) async fn audio_file_exists(path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || is_audio_file(&path))
        .await
        .unwrap_or(false)
}

/// Grants the asset protocol access to ONE audio file (no global scope is configured), so the webview
/// can stream it through convertFileSrc. Fails if the file is missing or is not an audio file.
#[tauri::command]
pub(crate) async fn allow_audio_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !is_audio_file(&path) {
            return Err("audio file not found".to_string());
        }
        app.asset_protocol_scope()
            .allow_file(Path::new(&path))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Grants the asset protocol access to ONE image or video (no global scope is configured), so the webview
/// can show it through convertFileSrc. Fails if the file is missing or is not an image or a video.
#[tauri::command]
pub(crate) async fn allow_media_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !is_media_file(&path) {
            return Err("media file not found".to_string());
        }
        app.asset_protocol_scope()
            .allow_file(Path::new(&path))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Opens an image or a video with the default app of the system (for the formats the webview cannot play).
/// Only existing files with an image or video extension are opened, so the command cannot launch anything else.
#[tauri::command]
pub(crate) async fn open_media_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_opener::OpenerExt;

        if !is_media_file(&path) {
            return Err("media file not found".to_string());
        }
        app.opener()
            .open_path(path, None::<&str>)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Tells, for each path and in the same order, whether the file linked to a group (audio, image or video) still exists.
/// One call checks a whole list, so the missing markers need no command per file. Like `audio_file_exists` only files with
/// an audio, image or video extension are considered, so the command cannot be used to probe other paths.
#[tauri::command]
pub(crate) async fn files_exist(paths: Vec<String>) -> Vec<bool> {
    let count = paths.len();
    tauri::async_runtime::spawn_blocking(move || {
        paths.iter().map(|path| is_linked_file(path)).collect()
    })
    .await
    .unwrap_or_else(|_| vec![true; count])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::temp_dir;

    #[test]
    fn is_audio_file_accepts_valid_extensions_case_insensitive() {
        let dir = temp_dir("audio");
        for name in ["a.mp3", "b.WAV", "c.Flac", "d.opus"] {
            let file = dir.join(name);
            std::fs::write(&file, b"x").unwrap();
            assert!(is_audio_file(file.to_str().unwrap()), "{name}");
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn is_audio_file_rejects_wrong_missing_and_directories() {
        let dir = temp_dir("reject");
        let text = dir.join("notes.txt");
        std::fs::write(&text, b"x").unwrap();
        assert!(!is_audio_file(text.to_str().unwrap()));
        assert!(!is_audio_file(dir.join("missing.mp3").to_str().unwrap()));
        let audio_dir = dir.join("folder.mp3");
        std::fs::create_dir_all(&audio_dir).unwrap();
        assert!(!is_audio_file(audio_dir.to_str().unwrap()));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn is_media_file_accepts_images_and_videos_and_rejects_the_rest() {
        let dir = temp_dir("media");
        for name in ["a.jpg", "b.PNG", "c.webp", "d.MP4", "e.mov", "f.avif"] {
            let file = dir.join(name);
            std::fs::write(&file, b"x").unwrap();
            assert!(is_media_file(file.to_str().unwrap()), "{name}");
        }
        let audio = dir.join("song.mp3");
        std::fs::write(&audio, b"x").unwrap();
        assert!(!is_media_file(audio.to_str().unwrap()));
        assert!(!is_media_file(dir.join("missing.png").to_str().unwrap()));
        let folder = dir.join("folder.png");
        std::fs::create_dir_all(&folder).unwrap();
        assert!(!is_media_file(folder.to_str().unwrap()));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn files_exist_checks_a_list_in_order() {
        let dir = temp_dir("exist");
        let song = dir.join("song.mp3");
        let photo = dir.join("photo.jpg");
        let notes = dir.join("notes.txt");
        for file in [&song, &photo, &notes] {
            std::fs::write(file, b"x").unwrap();
        }
        let paths: Vec<String> = [
            &song,
            &dir.join("gone.mp3"),
            &photo,
            &dir.join("gone.png"),
            &notes,
        ]
        .iter()
        .map(|path| path.to_str().unwrap().to_string())
        .collect();
        let result = tauri::async_runtime::block_on(files_exist(paths));
        assert_eq!(result, vec![true, false, true, false, false]);
        assert!(tauri::async_runtime::block_on(files_exist(vec![])).is_empty());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
