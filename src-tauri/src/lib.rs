mod media_session;

use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// Marker file: when it sits next to the executable the app runs in portable mode.
const PORTABLE_MARKER: &str = "portable.txt";
/// Environment variable that overrides the data folder (used by the e2e tests).
const DATA_DIR_ENV: &str = "EASYTASK_DATA_DIR";
/// Name of the data folder inside the user's Documents folder (installed mode).
const APP_FOLDER: &str = "EasyTask";
/// Log files rotate at this size and this many are kept.
const LOG_MAX_FILE_SIZE: u128 = 1_000_000;
const LOG_FILES_KEPT: usize = 5;
/// Subfolders of the data folder the UI is allowed to open in the file manager.
const OPENABLE_SUBFOLDERS: [&str; 2] = ["backups", "logs"];
/// Name of the "backups" subfolder, which the user can move elsewhere (the `backupFolder` preference).
const BACKUPS_SUBFOLDER: &str = "backups";
/// Settings file of tauri-plugin-store (the same the JS side loads in src/lib/store/initStore.ts) and the key
/// holding the custom backup folder.
const SETTINGS_FILE: &str = "settings.dat";
const BACKUP_FOLDER_KEY: &str = "backupFolder";
/// Keys of the booleans read at startup, written by the settings (APP_PREFS in src/lib/store/preferences.ts):
/// keep the names identical on both sides.
const REMEMBER_WINDOW_STATE_KEY: &str = "rememberWindowState";
const ALWAYS_ON_TOP_KEY: &str = "alwaysOnTop";
/// Background of the active theme, "#rrggbb" (written by the frontend at every theme change, src/lib/theme-startup.ts):
/// it is the color of the window before the page paints, so the start has no white flash.
const THEME_BACKGROUND_KEY: &str = "themeBackground";
// Only the Windows webview (WebView2) takes browser arguments
#[cfg(windows)]
const HARDWARE_ACCELERATION_KEY: &str = "hardwareAcceleration";

/// Where the app keeps its data and whether it runs in portable mode.
#[derive(Debug, Clone, PartialEq, Eq)]
struct DataDirInfo {
    path: PathBuf,
    portable: bool,
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
fn locate_data_dir(app: &tauri::AppHandle) -> Result<DataDirInfo, String> {
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

/// Absolute path of the data folder (database, settings, backups, logs). Created at startup.
#[tauri::command]
fn data_dir(info: tauri::State<'_, DataDirInfo>) -> String {
    info.path.to_string_lossy().into_owned()
}

/// True when the data folder is synced by OneDrive (Windows only): SQLite files in a synced folder can hit
/// "database is locked" errors or conflicted copies.
#[tauri::command]
fn data_dir_in_onedrive(info: tauri::State<'_, DataDirInfo>) -> bool {
    cfg!(windows) && path_in_onedrive(&info.path)
}

/// True when the app runs in portable mode (`portable.txt` next to the executable).
#[tauri::command]
fn is_portable(info: tauri::State<'_, DataDirInfo>) -> bool {
    info.portable
}

/// The settings file of the data folder (the store of the app), parsed. None when it is missing or not valid JSON.
fn read_settings(data_dir: &Path) -> Option<serde_json::Value> {
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
fn setting_bool_from(settings: Option<&serde_json::Value>, key: &str, default: bool) -> bool {
    settings
        .and_then(|settings| settings.get(key)?.as_bool())
        .unwrap_or(default)
}

/// The background of the active theme as (red, green, blue), from the settings already read. None when the key is
/// missing or is not a "#rrggbb" color (the default color of the window is kept then).
fn theme_background_from(settings: Option<&serde_json::Value>) -> Option<(u8, u8, u8)> {
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

/// The arguments of the WebView2 browser process. The media session of WebView2 belongs to msedgewebview2.exe, which
/// Windows shows as "Unknown app": it is turned off (HardwareMediaKeyHandling) and the app publishes its own one
/// (media_session.rs). The other features are the defaults of wry, which this list replaces. Without hardware
/// acceleration (setting of the user, for graphics problems) the GPU is not used.
#[cfg(windows)]
fn webview_browser_args(hardware_acceleration: bool) -> String {
    let mut args = String::from(
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,HardwareMediaKeyHandling",
    );
    if !hardware_acceleration {
        args.push_str(" --disable-gpu");
    }
    args
}

/// The custom backup folder chosen in the settings, read from the settings file of the data folder. None when
/// there is none, or when it is not an existing absolute folder (the default folder is used then).
fn custom_backup_folder(data_dir: &Path) -> Option<PathBuf> {
    custom_backup_folder_from(read_settings(data_dir).as_ref())
}

/// Like `custom_backup_folder`, on settings already read.
fn custom_backup_folder_from(settings: Option<&serde_json::Value>) -> Option<PathBuf> {
    let folder = PathBuf::from(settings?.get(BACKUP_FOLDER_KEY)?.as_str()?.trim());
    (folder.is_absolute() && folder.is_dir()).then_some(folder)
}

/// Opens the data folder (or one of its allowed subfolders) in the file manager. The "backups" subfolder resolves
/// to the custom backup folder when one is set; the UI never passes a path.
/// The file system work runs outside the UI thread.
#[tauri::command]
async fn open_data_folder(
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

/// Extensions (lowercase) of the audio files the app is allowed to check and play.
/// Keep in sync with AUDIO_EXTENSIONS in src/db/queries/audio.ts.
const AUDIO_EXTENSIONS: [&str; 8] = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "webm"];

/// True when the path is an existing regular file with an allowed audio extension.
fn is_audio_file(path: &str) -> bool {
    let path = Path::new(path);
    let has_audio_extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| AUDIO_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()))
        .unwrap_or(false);
    has_audio_extension && path.is_file()
}

/// Tells whether an audio file is still where the database says it is.
/// Only files with an audio extension are considered, so the command cannot be used to probe other paths.
#[tauri::command]
async fn audio_file_exists(path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || is_audio_file(&path))
        .await
        .unwrap_or(false)
}

/// Grants the asset protocol access to ONE audio file (no global scope is configured), so the webview
/// can stream it through convertFileSrc. Fails if the file is missing or is not an audio file.
#[tauri::command]
async fn allow_audio_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
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

/// Extensions (lowercase) of the images and videos that can be linked to a group.
/// Keep in sync with MEDIA_EXTENSIONS in src/db/queries/media.ts.
const MEDIA_EXTENSIONS: [&str; 11] = [
    "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "mp4", "webm", "mov", "m4v",
];

/// True when the path has one of the given extensions (case insensitive).
fn has_extension(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| allowed.contains(&extension.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// True when the path is an existing regular file with an allowed image or video extension.
fn is_media_file(path: &str) -> bool {
    let path = Path::new(path);
    has_extension(path, &MEDIA_EXTENSIONS) && path.is_file()
}

/// Grants the asset protocol access to ONE image or video (no global scope is configured), so the webview
/// can show it through convertFileSrc. Fails if the file is missing or is not an image or a video.
#[tauri::command]
async fn allow_media_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
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

/// Tells, for each path and in the same order, whether the file linked to a group (audio, image or video) still exists.
/// One call checks a whole list, so the missing markers need no command per file. Like `audio_file_exists` only files with
/// an audio, image or video extension are considered, so the command cannot be used to probe other paths.
#[tauri::command]
async fn files_exist(paths: Vec<String>) -> Vec<bool> {
    let count = paths.len();
    tauri::async_runtime::spawn_blocking(move || {
        paths.iter().map(|path| is_linked_file(path)).collect()
    })
    .await
    .unwrap_or_else(|_| vec![true; count])
}

/// True when the path is an existing regular file with an audio, image or video extension.
fn is_linked_file(path: &str) -> bool {
    let path = Path::new(path);
    (has_extension(path, &AUDIO_EXTENSIONS) || has_extension(path, &MEDIA_EXTENSIONS))
        && path.is_file()
}

/// Largest cover art (bytes) returned by `audio_metadata`; bigger pictures are left out to keep the reply small.
const MAX_COVER_BYTES: usize = 2 * 1024 * 1024;

/// Everything `audio_metadata` can tell about an audio file (camelCase for the JS side). Every field that may be
/// missing from the file is an Option.
#[derive(Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioMetadata {
    size_bytes: u64,
    /// Last modification, milliseconds since the Unix epoch.
    modified_ms: Option<i64>,
    /// File type, e.g. "MPEG" or "FLAC" (None when the content could not be parsed).
    format: Option<String>,
    codec: Option<String>,
    duration_ms: Option<u64>,
    /// Bitrate of the audio stream, kbps.
    audio_bitrate: Option<u32>,
    /// Bitrate of the whole file, kbps.
    overall_bitrate: Option<u32>,
    sample_rate: Option<u32>,
    bit_depth: Option<u8>,
    channels: Option<u8>,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    album_artist: Option<String>,
    /// Release/recording date, or just the year.
    date: Option<String>,
    track: Option<u32>,
    track_total: Option<u32>,
    disc: Option<u32>,
    genre: Option<String>,
    composer: Option<String>,
    comment: Option<String>,
    /// Cover art as `data:<mime>;base64,<data>`, only when it is at most 2 MB.
    cover: Option<String>,
}

/// Codec name for the file types where it is known from the type alone.
fn codec_name(file_type: lofty::file::FileType) -> Option<&'static str> {
    use lofty::file::FileType;
    match file_type {
        FileType::Mpeg => Some("MPEG audio"),
        FileType::Aac => Some("AAC"),
        FileType::Flac => Some("FLAC"),
        FileType::Opus => Some("Opus"),
        FileType::Vorbis => Some("Vorbis"),
        FileType::Speex => Some("Speex"),
        _ => None,
    }
}

/// Reads the properties and tags of an audio file. Without a readable tag block the file size and date are
/// still returned.
fn read_audio_metadata(path: &Path) -> Result<AudioMetadata, String> {
    use lofty::file::{AudioFile, TaggedFileExt};
    use lofty::picture::PictureType;
    use lofty::tag::{Accessor, ItemKey};

    let file_meta = std::fs::metadata(path).map_err(|error| error.to_string())?;
    let mut info = AudioMetadata {
        size_bytes: file_meta.len(),
        modified_ms: file_meta
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .and_then(|duration| i64::try_from(duration.as_millis()).ok()),
        ..Default::default()
    };

    let Ok(tagged) = lofty::read_from_path(path) else {
        return Ok(info);
    };
    let file_type = tagged.file_type();
    info.format = Some(format!("{file_type:?}").to_uppercase());
    info.codec = codec_name(file_type).map(str::to_string);

    let properties = tagged.properties();
    let duration = properties.duration().as_millis();
    info.duration_ms = (duration > 0).then(|| u64::try_from(duration).unwrap_or(u64::MAX));
    info.audio_bitrate = properties.audio_bitrate();
    info.overall_bitrate = properties.overall_bitrate();
    info.sample_rate = properties.sample_rate();
    info.bit_depth = properties.bit_depth();
    info.channels = properties.channels();

    if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
        let text = |value: Option<&str>| {
            value
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        };
        info.title = text(tag.title().as_deref());
        info.artist = text(tag.artist().as_deref());
        info.album = text(tag.album().as_deref());
        info.genre = text(tag.genre().as_deref());
        info.comment = text(tag.comment().as_deref());
        info.album_artist = text(tag.get_string(ItemKey::AlbumArtist));
        info.composer = text(tag.get_string(ItemKey::Composer));
        info.date = text(tag.get_string(ItemKey::RecordingDate))
            .or_else(|| tag.date().map(|date| date.year.to_string()));
        info.track = tag.track();
        info.track_total = tag.track_total();
        info.disc = tag.disk();

        let picture = tag
            .pictures()
            .iter()
            .find(|picture| picture.pic_type() == PictureType::CoverFront)
            .or_else(|| tag.pictures().first());
        if let Some(picture) = picture {
            let data = picture.data();
            if !data.is_empty() && data.len() <= MAX_COVER_BYTES {
                use base64::Engine;
                let mime = picture
                    .mime_type()
                    .map(|mime| mime.as_str())
                    .unwrap_or("image/jpeg");
                info.cover = Some(format!(
                    "data:{mime};base64,{}",
                    base64::engine::general_purpose::STANDARD.encode(data)
                ));
            }
        }
    }
    Ok(info)
}

/// Properties and tags of an audio file, for the details panel. Read-only; only existing files with an audio
/// extension are accepted, and the work runs outside the UI thread.
#[tauri::command]
async fn audio_metadata(path: String) -> Result<AudioMetadata, String> {
    if !is_audio_file(&path) {
        return Err("audio file not found".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || read_audio_metadata(Path::new(&path)))
        .await
        .map_err(|error| error.to_string())?
}

/// One statement of a `db_transaction` call.
#[derive(serde::Deserialize)]
struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<serde_json::Value>,
}

/// Outcome of one statement of a `db_transaction` call (camelCase, like the JS side expects).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StmtResult {
    rows_affected: u64,
    last_insert_id: i64,
}

/// Resolves a `{ "$ref": n, "offset": k }` parameter to `results[n].lastInsertId - k`.
/// Returns None when the value is not a reference object.
fn resolve_ref(value: &serde_json::Value, results: &[StmtResult]) -> Option<Result<i64, String>> {
    let object = value.as_object()?;
    let reference = object.get("$ref")?;
    let index = match reference.as_u64() {
        Some(index) => index as usize,
        None => return Some(Err("$ref must be a non-negative integer".to_string())),
    };
    let offset = object.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);
    Some(match results.get(index) {
        Some(result) => Ok(result.last_insert_id - offset),
        None => Err(format!(
            "$ref {index} does not point to an earlier statement"
        )),
    })
}

/// Runs the statements atomically on `pool`: all share one connection inside a transaction, which is
/// committed if every statement succeeds and rolled back (by dropping it) on the first error.
async fn run_transaction(
    pool: &sqlx::SqlitePool,
    statements: &[Stmt],
) -> Result<Vec<StmtResult>, String> {
    use sqlx::Executor;

    let mut tx = pool
        .begin()
        .await
        .map_err(|error| format!("cannot start the transaction: {error}"))?;
    let mut results: Vec<StmtResult> = Vec::with_capacity(statements.len());

    for (index, statement) in statements.iter().enumerate() {
        let mut query = sqlx::query(&statement.sql);
        for value in &statement.params {
            if let Some(resolved) = resolve_ref(value, &results) {
                let id = resolved.map_err(|error| format!("statement {index}: {error}"))?;
                query = query.bind(id);
                continue;
            }
            query = match value {
                serde_json::Value::Null => query.bind(None::<i64>),
                serde_json::Value::Bool(flag) => query.bind(*flag),
                serde_json::Value::String(text) => query.bind(text.as_str()),
                serde_json::Value::Number(number) => match number.as_i64() {
                    Some(integer) => query.bind(integer),
                    None => query.bind(number.as_f64().unwrap_or_default()),
                },
                other => query.bind(other.to_string()),
            };
        }
        // On error `tx` is dropped, which rolls the transaction back.
        let outcome = tx
            .execute(query)
            .await
            .map_err(|error| format!("statement {index} failed: {error}"))?;
        results.push(StmtResult {
            rows_affected: outcome.rows_affected(),
            last_insert_id: outcome.last_insert_rowid(),
        });
    }

    tx.commit()
        .await
        .map_err(|error| format!("commit failed: {error}"))?;
    Ok(results)
}

/// Runs several statements atomically on the pool loaded by tauri-plugin-sql (same `db` key passed to
/// `Database.load`). See `run_transaction`.
#[tauri::command]
async fn db_transaction(
    db_instances: tauri::State<'_, tauri_plugin_sql::DbInstances>,
    db: String,
    statements: Vec<Stmt>,
) -> Result<Vec<StmtResult>, String> {
    // Clone the pool out of the map: the read guard must not live across the whole transaction (it would block
    // load/close of databases meanwhile)
    let pool = {
        let instances = db_instances.0.read().await;
        match instances.get(&db) {
            Some(tauri_plugin_sql::DbPool::Sqlite(pool)) => pool.clone(),
            None => return Err(format!("database {db} is not loaded")),
        }
    };
    run_transaction(&pool, &statements).await
}

/// Portable mode as seen before the app exists (plugins are registered first).
fn portable_install() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(is_portable_install))
        .unwrap_or(false)
}

/// Whether the single-instance lock applies. Only release builds on the default data folder take it:
/// a debug build (`tauri dev`, e2e) or an `EASYTASK_DATA_DIR` override uses its own data, so it must be able to
/// run next to the installed app instead of exiting immediately.
fn single_instance_enabled(debug_build: bool, data_dir_override: bool) -> bool {
    !debug_build && !data_dir_override
}

/// File of the window state of the plugin. By default it is `.window-state.json` in the user profile (the plugin joins the
/// name to the app config folder); with an `EASYTASK_DATA_DIR` override it is a file inside that folder, so the e2e runs (and
/// any other run with its own data) neither read nor overwrite the window of the installed app. An absolute path replaces the
/// config folder in the join, which is how the plugin takes it. A relative or empty override is ignored here (the data folder
/// resolution reports it).
fn window_state_filename(data_dir_override: Option<&str>) -> String {
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
fn set_app_user_model_id(identifier: &str) {
    let id = windows::core::HSTRING::from(identifier);
    // SAFETY: `id` is a null-terminated UTF-16 string that outlives the call
    let _ = unsafe { windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(&id) };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    #[cfg(windows)]
    set_app_user_model_id(&context.config().identifier);
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

            // Runtime scope limited to the data folder (no global scope in the capabilities).
            app.fs_scope().allow_directory(&info.path, true)?;
            app.asset_protocol_scope()
                .allow_directory(&info.path, true)?;
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
                window = window.additional_browser_args(&webview_browser_args(setting_bool_from(
                    settings.as_ref(),
                    HARDWARE_ACCELERATION_KEY,
                    true,
                )));
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
            audio_file_exists,
            allow_audio_file,
            allow_media_file,
            files_exist,
            audio_metadata,
            db_transaction,
            data_dir,
            is_portable,
            data_dir_in_onedrive,
            open_data_folder,
            media_session::media_session_native,
            media_session::media_session_update,
            media_session::media_session_timeline,
            media_session::media_session_clear
        ])
        .run(context)
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;

    fn results(ids: &[i64]) -> Vec<StmtResult> {
        ids.iter()
            .map(|id| StmtResult {
                rows_affected: 1,
                last_insert_id: *id,
            })
            .collect()
    }

    #[test]
    fn resolve_ref_valid() {
        let out = resolve_ref(&json!({ "$ref": 1 }), &results(&[5, 9]));
        assert_eq!(out, Some(Ok(9)));
    }

    #[test]
    fn resolve_ref_with_offset() {
        let out = resolve_ref(&json!({ "$ref": 0, "offset": 2 }), &results(&[10]));
        assert_eq!(out, Some(Ok(8)));
    }

    #[test]
    fn resolve_ref_index_out_of_range() {
        let out = resolve_ref(&json!({ "$ref": 3 }), &results(&[1]));
        assert!(matches!(out, Some(Err(_))));
    }

    #[test]
    fn resolve_ref_non_integer() {
        for value in [
            json!({ "$ref": "0" }),
            json!({ "$ref": -1 }),
            json!({ "$ref": 1.5 }),
        ] {
            assert!(matches!(
                resolve_ref(&value, &results(&[1, 2])),
                Some(Err(_))
            ));
        }
    }

    #[test]
    fn resolve_ref_non_reference_values() {
        let r = results(&[1]);
        assert_eq!(resolve_ref(&json!(3), &r), None);
        assert_eq!(resolve_ref(&json!("x"), &r), None);
        assert_eq!(resolve_ref(&json!({ "other": 1 }), &r), None);
    }

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("easytask-test-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

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

    /// Minimal valid WAV: 8000 Hz, mono, 16 bit, 1 second of silence.
    fn write_test_wav(path: &Path) {
        let data_len: u32 = 16000;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&8000u32.to_le_bytes());
        bytes.extend_from_slice(&16000u32.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());
        bytes.extend(std::iter::repeat(0u8).take(data_len as usize));
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn audio_metadata_reads_wav_properties() {
        let dir = temp_dir("meta-wav");
        let file = dir.join("tone.wav");
        write_test_wav(&file);
        let info = read_audio_metadata(&file).unwrap();
        assert_eq!(info.size_bytes, 16044);
        assert!(info.modified_ms.is_some());
        assert_eq!(info.format.as_deref(), Some("WAV"));
        assert_eq!(info.duration_ms, Some(1000));
        assert_eq!(info.sample_rate, Some(8000));
        assert_eq!(info.channels, Some(1));
        assert_eq!(info.bit_depth, Some(16));
        assert_eq!(info.title, None);
        assert_eq!(info.cover, None);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn audio_metadata_unparsable_audio_keeps_size_and_date() {
        let dir = temp_dir("meta-bad");
        let file = dir.join("broken.mp3");
        std::fs::write(&file, b"not really audio").unwrap();
        let info = read_audio_metadata(&file).unwrap();
        assert_eq!(info.size_bytes, 16);
        assert!(info.modified_ms.is_some());
        assert_eq!(info.format, None);
        assert_eq!(info.duration_ms, None);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn audio_metadata_command_rejects_non_audio_and_missing_files() {
        let dir = temp_dir("meta-reject");
        let text = dir.join("notes.txt");
        std::fs::write(&text, b"x").unwrap();
        assert!(
            tauri::async_runtime::block_on(audio_metadata(text.to_str().unwrap().to_string()))
                .is_err()
        );
        let missing = dir.join("gone.mp3");
        assert!(tauri::async_runtime::block_on(audio_metadata(
            missing.to_str().unwrap().to_string()
        ))
        .is_err());
        let wav = dir.join("ok.wav");
        write_test_wav(&wav);
        let ok = tauri::async_runtime::block_on(audio_metadata(wav.to_str().unwrap().to_string()));
        assert_eq!(ok.unwrap().sample_rate, Some(8000));
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

    #[cfg(windows)]
    #[test]
    fn webview_args_turn_the_gpu_off_only_without_hardware_acceleration() {
        assert!(!webview_browser_args(true).contains("--disable-gpu"));
        assert!(webview_browser_args(false).contains("--disable-gpu"));
        assert!(webview_browser_args(false).contains("HardwareMediaKeyHandling"));
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

    async fn memory_pool() -> sqlx::SqlitePool {
        // One connection only: every in-memory connection would otherwise be a separate database.
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL, parent INTEGER)")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    fn stmt(sql: &str, params: Vec<serde_json::Value>) -> Stmt {
        Stmt {
            sql: sql.to_string(),
            params,
        }
    }

    async fn count(pool: &sqlx::SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM t")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[test]
    fn run_transaction_commits_and_resolves_refs() {
        tauri::async_runtime::block_on(async {
            let pool = memory_pool().await;
            let statements = [
                stmt("INSERT INTO t (v) VALUES (?)", vec![json!("a")]),
                stmt(
                    "INSERT INTO t (v, parent) VALUES (?, ?)",
                    vec![json!("b"), json!({ "$ref": 0 })],
                ),
            ];
            let out = run_transaction(&pool, &statements).await.unwrap();
            assert_eq!(out.len(), 2);
            assert_eq!(out[0].rows_affected, 1);
            assert_eq!(count(&pool).await, 2);
            let parent: i64 = sqlx::query_scalar("SELECT parent FROM t WHERE v = 'b'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(parent, out[0].last_insert_id);
        });
    }

    #[test]
    fn run_transaction_rolls_back_on_error() {
        tauri::async_runtime::block_on(async {
            let pool = memory_pool().await;
            let statements = [
                stmt("INSERT INTO t (v) VALUES (?)", vec![json!("a")]),
                // NOT NULL violation
                stmt("INSERT INTO t (v) VALUES (?)", vec![json!(null)]),
            ];
            let error = run_transaction(&pool, &statements).await.unwrap_err();
            assert!(error.contains("statement 1"), "{error}");
            assert_eq!(count(&pool).await, 0);
        });
    }
}
