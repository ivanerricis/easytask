//! Export and import of a workspace as a `.easytask.zip`: the JSON of the export plus the linked audio, image and video files.
//!
//! The files are read and written here, streamed from/to their paths: their bytes never cross the IPC bridge.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::files::{has_extension, is_linked_file, AUDIO_EXTENSIONS, MEDIA_EXTENSIONS};
use crate::paths::DataDirInfo;

/// Name of the JSON entry at the root of the archive.
const JSON_ENTRY: &str = "workspace.easytask.json";
/// Folder of the archive that holds the linked files.
const FILES_PREFIX: &str = "files/";
/// Folder of the data folder the files of an imported archive are extracted to.
const MEDIA_SUBFOLDER: &str = "media";
/// Largest JSON accepted from an archive (the same cap as a plain `.easytask.json`); the media files have no cap.
const MAX_JSON_BYTES: u64 = 50 * 1024 * 1024;
/// Progress is reported at most this often (and at the end).
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);
const COPY_BUFFER: usize = 256 * 1024;

/// What the UI needs to know before it offers to include the linked files.
#[derive(Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LinkedFilesInfo {
    /// Total size (bytes) of the linked files that exist.
    bytes: u64,
    /// How many of the (distinct) paths exist.
    count: u64,
    /// How many do not.
    missing: u64,
}

/// A file to put in the archive: where it is and its name inside (`files/...`).
#[derive(Debug, Deserialize)]
pub struct ZipSource {
    path: String,
    entry: String,
}

/// Progress of an export or import, in bytes of the media files.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct Progress {
    done: u64,
    total: u64,
}

/// Result of an export.
#[derive(Debug, Default, Serialize, PartialEq, Eq)]
pub struct ExportSummary {
    /// Files written in the archive.
    added: u64,
    /// Files that no longer exist (skipped).
    missing: u64,
}

/// Result of an import: the JSON of the export and, for each file of the archive, where it was extracted.
#[derive(Debug, Default, Serialize, PartialEq, Eq)]
pub struct ImportedZip {
    json: String,
    /// Entry name in the archive (`files/...`) to the absolute path of the extracted copy.
    files: HashMap<String, String>,
}

/// Throttled progress reporting.
struct Reporter<'a> {
    done: u64,
    total: u64,
    last: Instant,
    sink: &'a mut dyn FnMut(Progress),
}

impl<'a> Reporter<'a> {
    fn new(total: u64, sink: &'a mut dyn FnMut(Progress)) -> Self {
        sink(Progress { done: 0, total });
        Reporter {
            done: 0,
            total,
            last: Instant::now(),
            sink,
        }
    }

    fn advance(&mut self, bytes: u64) {
        self.done += bytes;
        if self.last.elapsed() >= PROGRESS_INTERVAL {
            self.last = Instant::now();
            (self.sink)(Progress {
                done: self.done,
                total: self.total,
            });
        }
    }

    fn finish(&mut self) {
        (self.sink)(Progress {
            done: self.total,
            total: self.total,
        });
    }
}

/// Copies `reader` to `writer` in chunks, reporting the bytes copied.
fn copy_reporting(
    reader: &mut impl Read,
    writer: &mut impl Write,
    reporter: &mut Reporter,
) -> Result<(), String> {
    let mut buffer = vec![0u8; COPY_BUFFER];
    loop {
        let read = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            return Ok(());
        }
        writer
            .write_all(&buffer[..read])
            .map_err(|e| e.to_string())?;
        reporter.advance(read as u64);
    }
}

/// Size and count of the linked files (audio, image, video) that exist; each distinct path counts once.
/// Only files with an allowed extension are considered, so this cannot be used to probe other paths.
pub fn linked_files_info(paths: &[String]) -> LinkedFilesInfo {
    let mut info = LinkedFilesInfo::default();
    let mut seen = HashSet::new();
    for path in paths {
        if !seen.insert(path.as_str()) {
            continue;
        }
        match is_linked_file(path)
            .then(|| std::fs::metadata(path).ok())
            .flatten()
        {
            Some(meta) => {
                info.count += 1;
                info.bytes += meta.len();
            }
            None => info.missing += 1,
        }
    }
    info
}

/// True for a name that can safely be an archive entry or sit under the extraction folder: relative, forward slashes only,
/// no drive prefix, no empty, `.` or `..` component, no control character.
fn is_safe_entry_name(name: &str) -> bool {
    if name.is_empty() || name.starts_with('/') || name.contains('\\') || name.contains(':') {
        return false;
    }
    if name.chars().any(|c| c.is_control()) {
        return false;
    }
    let trimmed = name.strip_suffix('/').unwrap_or(name);
    trimmed
        .split('/')
        .all(|part| !part.is_empty() && part != "." && part != "..")
}

/// True for an entry of the archive that is a symbolic link (Unix mode in the external attributes).
fn is_symlink_mode(mode: Option<u32>) -> bool {
    mode.is_some_and(|mode| mode & 0o170000 == 0o120000)
}

/// Writes the archive: the JSON (deflated) and the files (stored: media is already compressed), streamed from their paths.
/// Missing files are skipped and counted. The archive is written to a `.part` file and renamed when complete, so a failure
/// never leaves a broken archive at `dest`.
pub fn write_zip(
    dest: &Path,
    json: &str,
    files: &[ZipSource],
    sink: &mut dyn FnMut(Progress),
) -> Result<ExportSummary, String> {
    let mut names = HashSet::new();
    for file in files {
        if !file.entry.starts_with(FILES_PREFIX)
            || !is_safe_entry_name(&file.entry)
            || file.entry.ends_with('/')
        {
            return Err(format!("invalid entry name: {}", file.entry));
        }
        if !names.insert(file.entry.as_str()) {
            return Err(format!("duplicate entry name: {}", file.entry));
        }
    }
    // Only the files that exist are written; the total comes from the same list
    let present: Vec<(&ZipSource, u64)> = files
        .iter()
        .filter(|file| is_linked_file(&file.path))
        .filter_map(|file| {
            std::fs::metadata(&file.path)
                .ok()
                .map(|meta| (file, meta.len()))
        })
        .collect();
    let total = present.iter().map(|(_, size)| size).sum();
    let missing = (files.len() - present.len()) as u64;

    let mut part = dest.as_os_str().to_owned();
    part.push(".part");
    let part = PathBuf::from(part);
    let result = (|| -> Result<ExportSummary, String> {
        let out = File::create(&part).map_err(|e| e.to_string())?;
        let mut zip = ZipWriter::new(BufWriter::new(out));
        let mut reporter = Reporter::new(total, sink);
        zip.start_file(
            JSON_ENTRY,
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|e| e.to_string())?;
        zip.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
        let mut added = 0;
        for (file, size) in &present {
            let options = SimpleFileOptions::default()
                .compression_method(CompressionMethod::Stored)
                .large_file(*size >= u32::MAX as u64);
            let mut source = match File::open(&file.path) {
                Ok(source) => source,
                // Removed in the meantime
                Err(_) => continue,
            };
            zip.start_file(file.entry.as_str(), options)
                .map_err(|e| e.to_string())?;
            copy_reporting(&mut source, &mut zip, &mut reporter)?;
            added += 1;
        }
        let mut out = zip.finish().map_err(|e| e.to_string())?;
        out.flush().map_err(|e| e.to_string())?;
        reporter.finish();
        Ok(ExportSummary {
            added,
            missing: missing + (present.len() as u64 - added),
        })
    })();
    match result {
        Ok(summary) => {
            std::fs::rename(&part, dest).map_err(|e| {
                let _ = std::fs::remove_file(&part);
                e.to_string()
            })?;
            Ok(summary)
        }
        Err(error) => {
            let _ = std::fs::remove_file(&part);
            Err(error)
        }
    }
}

const WINDOWS_RESERVED: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// The file name an extracted entry gets: the last component of the entry, without the `<number>_` prefix the export adds
/// for uniqueness, with the characters Windows does not allow replaced.
fn extracted_file_name(entry: &str) -> String {
    let base = entry.rsplit('/').next().unwrap_or(entry);
    let without_index = match base.split_once('_') {
        Some((index, rest))
            if !index.is_empty()
                && index.chars().all(|c| c.is_ascii_digit())
                && !rest.is_empty() =>
        {
            rest
        }
        _ => base,
    };
    let cleaned: String = without_index
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim_end_matches(['.', ' ']).to_string();
    let (stem, extension) = match cleaned.rsplit_once('.') {
        Some((stem, extension)) => (stem.to_string(), format!(".{extension}")),
        _ => (cleaned.clone(), String::new()),
    };
    let mut stem: String = stem.chars().take(120).collect();
    if stem.trim().is_empty() {
        stem = "file".to_string();
    }
    if WINDOWS_RESERVED.contains(&stem.to_ascii_lowercase().as_str()) {
        stem.insert(0, '_');
    }
    format!("{stem}{extension}")
}

/// Creates a NEW file in `dir` named `name`, or `stem (2).ext`, `stem (3).ext`... when taken: nothing is ever overwritten.
fn create_unique(dir: &Path, name: &str) -> Result<(File, PathBuf), String> {
    let (stem, extension) = match name.rsplit_once('.') {
        Some((stem, extension)) => (stem, format!(".{extension}")),
        None => (name, String::new()),
    };
    for attempt in 1..10_000u32 {
        let candidate = if attempt == 1 {
            name.to_string()
        } else {
            format!("{stem} ({attempt}){extension}")
        };
        let path = dir.join(&candidate);
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => return Ok((file, path)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("no free file name".to_string())
}

/// True for an entry whose file is extracted: under `files/`, with an audio, image or video extension.
fn is_extractable(name: &str) -> bool {
    name.starts_with(FILES_PREFIX)
        && !name.ends_with('/')
        && (has_extension(Path::new(name), &AUDIO_EXTENSIONS)
            || has_extension(Path::new(name), &MEDIA_EXTENSIONS))
}

/// Reads an archive: validates EVERY entry first (an absolute path, a `..`, a drive prefix, a backslash or a symbolic link
/// rejects the whole archive), reads the JSON and extracts the files into `media_dir` with unique names.
/// On a failure the files already extracted are deleted.
pub fn read_zip(
    src: &Path,
    media_dir: &Path,
    sink: &mut dyn FnMut(Progress),
) -> Result<ImportedZip, String> {
    let file = File::open(src).map_err(|e| e.to_string())?;
    let mut archive =
        ZipArchive::new(BufReader::new(file)).map_err(|e| format!("INVALID_ARCHIVE: {e}"))?;

    let mut json_index = None;
    let mut extract: Vec<(usize, String, u64)> = Vec::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index_raw(index)
            .map_err(|e| format!("INVALID_ARCHIVE: {e}"))?;
        let name = entry
            .name()
            .map_err(|e| format!("INVALID_ARCHIVE: unsafe entry name: {e}"))?
            .to_string();
        if !is_safe_entry_name(&name) {
            return Err(format!("INVALID_ARCHIVE: unsafe entry name {name:?}"));
        }
        if is_symlink_mode(entry.unix_mode()) {
            return Err(format!("INVALID_ARCHIVE: symbolic link {name:?}"));
        }
        if entry.is_dir() {
            continue;
        }
        if name == JSON_ENTRY {
            if json_index.replace(index).is_some() {
                return Err("INVALID_ARCHIVE: duplicate JSON entry".to_string());
            }
        } else if is_extractable(&name) {
            extract.push((index, name, entry.size()));
        }
    }
    let json_index = json_index.ok_or("INVALID_ARCHIVE: the JSON entry is missing")?;

    let mut json = Vec::new();
    archive
        .by_index(json_index)
        .map_err(|e| format!("INVALID_ARCHIVE: {e}"))?
        .take(MAX_JSON_BYTES + 1)
        .read_to_end(&mut json)
        .map_err(|e| format!("INVALID_ARCHIVE: {e}"))?;
    if json.len() as u64 > MAX_JSON_BYTES {
        return Err("JSON_TOO_LARGE".to_string());
    }
    let json = String::from_utf8(json).map_err(|_| "INVALID_ARCHIVE: the JSON is not UTF-8")?;

    std::fs::create_dir_all(media_dir).map_err(|e| e.to_string())?;
    let total = extract.iter().map(|(_, _, size)| size).sum();
    let mut reporter = Reporter::new(total, sink);
    let mut files = HashMap::new();
    let mut created: Vec<PathBuf> = Vec::new();
    let outcome = (|| -> Result<(), String> {
        for (index, name, _) in &extract {
            let mut entry = archive
                .by_index(*index)
                .map_err(|e| format!("INVALID_ARCHIVE: {e}"))?;
            let (file, path) = create_unique(media_dir, &extracted_file_name(name))?;
            created.push(path.clone());
            let mut writer = BufWriter::new(file);
            copy_reporting(&mut entry, &mut writer, &mut reporter)?;
            writer.flush().map_err(|e| e.to_string())?;
            files.insert(name.clone(), path.to_string_lossy().into_owned());
        }
        Ok(())
    })();
    if let Err(error) = outcome {
        for path in created {
            let _ = std::fs::remove_file(path);
        }
        return Err(error);
    }
    reporter.finish();
    Ok(ImportedZip { json, files })
}

/// Deletes files extracted by `read_zip`. Only direct children of `media_dir` are touched: nothing else can be deleted.
/// Returns how many were deleted.
pub fn delete_extracted(media_dir: &Path, paths: &[String]) -> u64 {
    let Ok(media_dir) = media_dir.canonicalize() else {
        return 0;
    };
    let mut deleted = 0;
    for path in paths {
        let Ok(canonical) = Path::new(path).canonicalize() else {
            continue;
        };
        if canonical.parent() == Some(media_dir.as_path())
            && canonical.is_file()
            && std::fs::remove_file(&canonical).is_ok()
        {
            deleted += 1;
        }
    }
    deleted
}

fn media_dir(info: &DataDirInfo) -> PathBuf {
    info.path.join(MEDIA_SUBFOLDER)
}

/// Size, count and number of missing files among the linked files of an export (distinct paths).
#[tauri::command]
pub async fn linked_files_size(paths: Vec<String>) -> Result<LinkedFilesInfo, String> {
    tauri::async_runtime::spawn_blocking(move || linked_files_info(&paths))
        .await
        .map_err(|e| e.to_string())
}

/// Writes `dest` as a zip with the export JSON and the files, streamed from disk; progress goes through `on_progress`.
#[tauri::command]
pub async fn export_zip(
    dest: String,
    json: String,
    files: Vec<ZipSource>,
    on_progress: Channel<Progress>,
) -> Result<ExportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        write_zip(Path::new(&dest), &json, &files, &mut |progress| {
            let _ = on_progress.send(progress);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Reads a `.easytask.zip`: returns its JSON and where its files were extracted (the `media` folder of the data folder).
#[tauri::command]
pub async fn import_zip(
    info: tauri::State<'_, DataDirInfo>,
    src: String,
    on_progress: Channel<Progress>,
) -> Result<ImportedZip, String> {
    let dir = media_dir(&info);
    tauri::async_runtime::spawn_blocking(move || {
        read_zip(Path::new(&src), &dir, &mut |progress| {
            let _ = on_progress.send(progress);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Deletes the files `import_zip` extracted (when the import is cancelled or fails). Only files directly inside the
/// `media` folder of the data folder can be deleted.
#[tauri::command]
pub async fn delete_extracted_files(
    info: tauri::State<'_, DataDirInfo>,
    paths: Vec<String>,
) -> Result<u64, String> {
    let dir = media_dir(&info);
    tauri::async_runtime::spawn_blocking(move || delete_extracted(&dir, &paths))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn temp_dir(name: &str) -> PathBuf {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "easytask-zip-{}-{}-{name}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn source(dir: &Path, name: &str, content: &[u8], entry: &str) -> ZipSource {
        let path = dir.join(name);
        std::fs::write(&path, content).unwrap();
        ZipSource {
            path: path.to_string_lossy().into_owned(),
            entry: entry.to_string(),
        }
    }

    fn no_progress() -> impl FnMut(Progress) {
        |_| {}
    }

    /// Builds an archive by hand (the names are not checked by the writer).
    fn raw_zip(dest: &Path, entries: &[(&str, &[u8])]) {
        let mut zip = ZipWriter::new(File::create(dest).unwrap());
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        for (name, data) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn roundtrip_writes_and_extracts_files_with_progress() {
        let dir = temp_dir("roundtrip");
        let files = [
            source(&dir, "a.mp3", b"audio-bytes", "files/0_a.mp3"),
            source(&dir, "b.png", &vec![7u8; 600_000], "files/1_b.png"),
        ];
        let zip_path = dir.join("out.easytask.zip");
        let mut events = Vec::new();
        let summary =
            write_zip(&zip_path, "{\"hello\":1}", &files, &mut |p| events.push(p)).unwrap();
        assert_eq!(
            summary,
            ExportSummary {
                added: 2,
                missing: 0
            }
        );
        assert!(!dir.join("out.easytask.zip.part").exists());
        assert_eq!(events.first().unwrap().done, 0);
        assert_eq!(
            events.last().unwrap(),
            &Progress {
                done: 600_011,
                total: 600_011
            }
        );

        let media = dir.join("data").join("media");
        let imported = read_zip(&zip_path, &media, &mut no_progress()).unwrap();
        assert_eq!(imported.json, "{\"hello\":1}");
        assert_eq!(imported.files.len(), 2);
        let audio = Path::new(&imported.files["files/0_a.mp3"]);
        assert_eq!(audio.parent().unwrap(), media);
        assert_eq!(audio.file_name().unwrap(), "a.mp3");
        assert_eq!(std::fs::read(audio).unwrap(), b"audio-bytes");
        assert_eq!(
            std::fs::read(&imported.files["files/1_b.png"])
                .unwrap()
                .len(),
            600_000
        );
    }

    #[test]
    fn missing_files_are_skipped_and_counted() {
        let dir = temp_dir("missing");
        let files = [
            source(&dir, "a.mp3", b"x", "files/0_a.mp3"),
            ZipSource {
                path: dir.join("gone.png").to_string_lossy().into_owned(),
                entry: "files/1_gone.png".to_string(),
            },
            // Not a linked file type: never put in an archive
            source(&dir, "secret.txt", b"x", "files/2_secret.txt"),
        ];
        let zip_path = dir.join("m.zip");
        let summary = write_zip(&zip_path, "{}", &files, &mut no_progress()).unwrap();
        assert_eq!(
            summary,
            ExportSummary {
                added: 1,
                missing: 2
            }
        );
        let imported = read_zip(&zip_path, &dir.join("media"), &mut no_progress()).unwrap();
        assert_eq!(
            imported.files.keys().collect::<Vec<_>>(),
            vec!["files/0_a.mp3"]
        );
    }

    #[test]
    fn bad_entry_names_are_refused_on_export() {
        let dir = temp_dir("badexport");
        for entry in [
            "../x.mp3",
            "files/../x.mp3",
            "/files/x.mp3",
            "other/x.mp3",
            "files/a\\b.mp3",
            "files/C:x.mp3",
        ] {
            let files = [source(&dir, "a.mp3", b"x", entry)];
            assert!(
                write_zip(&dir.join("z.zip"), "{}", &files, &mut no_progress()).is_err(),
                "{entry}"
            );
        }
        let files = [
            source(&dir, "a.mp3", b"x", "files/a.mp3"),
            source(&dir, "b.mp3", b"y", "files/a.mp3"),
        ];
        assert!(write_zip(&dir.join("z.zip"), "{}", &files, &mut no_progress()).is_err());
        assert!(!dir.join("z.zip").exists());
        assert!(!dir.join("z.zip.part").exists());
    }

    #[test]
    fn zip_slip_and_unsafe_names_are_rejected() {
        let dir = temp_dir("slip");
        for name in [
            "../evil.mp3",
            "files/../../evil.mp3",
            "/abs/evil.mp3",
            "C:/evil.mp3",
            "files/C:evil.mp3",
            "files\\evil.mp3",
            "files//evil.mp3",
        ] {
            let zip_path = dir.join("slip.zip");
            raw_zip(&zip_path, &[(JSON_ENTRY, b"{}"), (name, b"x")]);
            let media = dir.join("media");
            let error = read_zip(&zip_path, &media, &mut no_progress()).unwrap_err();
            assert!(error.starts_with("INVALID_ARCHIVE"), "{name}: {error}");
            assert!(!dir.join("evil.mp3").exists());
            assert!(
                !media.exists() || std::fs::read_dir(&media).unwrap().next().is_none(),
                "{name}"
            );
        }
    }

    #[test]
    fn symlink_entries_are_rejected() {
        let dir = temp_dir("symlink");
        let zip_path = dir.join("link.zip");
        let mut zip = ZipWriter::new(File::create(&zip_path).unwrap());
        zip.start_file(JSON_ENTRY, SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"{}").unwrap();
        zip.add_symlink(
            "files/0_link.mp3",
            "/etc/passwd",
            SimpleFileOptions::default(),
        )
        .unwrap();
        zip.finish().unwrap();
        let error = read_zip(&zip_path, &dir.join("media"), &mut no_progress()).unwrap_err();
        assert!(error.contains("symbolic link"), "{error}");
    }

    #[test]
    fn archive_without_json_or_with_huge_json_is_rejected() {
        let dir = temp_dir("json");
        let zip_path = dir.join("nojson.zip");
        raw_zip(&zip_path, &[("files/0_a.mp3", b"x")]);
        assert!(read_zip(&zip_path, &dir.join("media"), &mut no_progress())
            .unwrap_err()
            .starts_with("INVALID_ARCHIVE"));

        let big = vec![b' '; (MAX_JSON_BYTES + 1) as usize];
        raw_zip(&zip_path, &[(JSON_ENTRY, &big)]);
        assert_eq!(
            read_zip(&zip_path, &dir.join("media"), &mut no_progress()).unwrap_err(),
            "JSON_TOO_LARGE"
        );

        std::fs::write(&zip_path, b"this is not a zip").unwrap();
        assert!(read_zip(&zip_path, &dir.join("media"), &mut no_progress())
            .unwrap_err()
            .starts_with("INVALID_ARCHIVE"));
    }

    #[test]
    fn media_files_may_exceed_the_json_cap_and_other_entries_are_ignored() {
        let dir = temp_dir("ignored");
        let zip_path = dir.join("i.zip");
        raw_zip(
            &zip_path,
            &[
                (JSON_ENTRY, b"{}"),
                ("files/0_a.exe", b"x"),
                ("readme.txt", b"x"),
                ("files/1_ok.PNG", b"png"),
            ],
        );
        let imported = read_zip(&zip_path, &dir.join("media"), &mut no_progress()).unwrap();
        assert_eq!(
            imported.files.keys().collect::<Vec<_>>(),
            vec!["files/1_ok.PNG"]
        );
    }

    #[test]
    fn extraction_never_overwrites_and_names_are_unique() {
        let dir = temp_dir("unique");
        let media = dir.join("media");
        std::fs::create_dir_all(&media).unwrap();
        std::fs::write(media.join("song.mp3"), b"mine").unwrap();
        let zip_path = dir.join("u.zip");
        raw_zip(
            &zip_path,
            &[
                (JSON_ENTRY, b"{}"),
                ("files/0_song.mp3", b"first"),
                ("files/1_song.mp3", b"second"),
            ],
        );
        let imported = read_zip(&zip_path, &media, &mut no_progress()).unwrap();
        let a = &imported.files["files/0_song.mp3"];
        let b = &imported.files["files/1_song.mp3"];
        assert_ne!(a, b);
        assert_eq!(std::fs::read(media.join("song.mp3")).unwrap(), b"mine");
        assert_eq!(std::fs::read(a).unwrap(), b"first");
        assert_eq!(std::fs::read(b).unwrap(), b"second");
        // A second import of the same archive still never overwrites
        let again = read_zip(&zip_path, &media, &mut no_progress()).unwrap();
        assert!(!again.files.values().any(|p| p == a || p == b));
        assert_eq!(std::fs::read(a).unwrap(), b"first");
    }

    #[test]
    fn extracted_file_names_are_sanitized() {
        assert_eq!(extracted_file_name("files/12_song.mp3"), "song.mp3");
        assert_eq!(extracted_file_name("files/3_my_song.mp3"), "my_song.mp3");
        assert_eq!(extracted_file_name("files/plain.png"), "plain.png");
        assert_eq!(extracted_file_name("files/0_a*b?.png"), "a_b_.png");
        assert_eq!(extracted_file_name("files/0_con.mp3"), "_con.mp3");
        assert_eq!(extracted_file_name("files/0_.png"), "file.png");
    }

    #[test]
    fn failed_extraction_removes_what_was_extracted() {
        let dir = temp_dir("rollback");
        let media = dir.join("media");
        let zip_path = dir.join("r.zip");
        // The second entry is declared Stored but truncated by hand below: corrupt the archive after the first file
        raw_zip(
            &zip_path,
            &[
                (JSON_ENTRY, b"{}"),
                ("files/0_a.mp3", b"first-file"),
                ("files/1_b.mp3", b"second-file-long-enough"),
            ],
        );
        let mut bytes = std::fs::read(&zip_path).unwrap();
        let at = bytes
            .windows(22)
            .position(|w| w == b"second-file-long-enoug")
            .unwrap();
        // Break the CRC of the second file's data
        bytes[at] ^= 0xff;
        std::fs::write(&zip_path, bytes).unwrap();
        assert!(read_zip(&zip_path, &media, &mut no_progress()).is_err());
        assert_eq!(std::fs::read_dir(&media).unwrap().count(), 0);
    }

    #[test]
    fn delete_extracted_only_touches_the_media_folder() {
        let dir = temp_dir("delete");
        let media = dir.join("media");
        std::fs::create_dir_all(&media).unwrap();
        let inside = media.join("a.mp3");
        let outside = dir.join("b.mp3");
        std::fs::write(&inside, b"x").unwrap();
        std::fs::write(&outside, b"x").unwrap();
        let sneaky = media.join("..").join("b.mp3");
        let deleted = delete_extracted(
            &media,
            &[
                inside.to_string_lossy().into_owned(),
                outside.to_string_lossy().into_owned(),
                sneaky.to_string_lossy().into_owned(),
            ],
        );
        assert_eq!(deleted, 1);
        assert!(!inside.exists());
        assert!(outside.exists());
    }

    #[test]
    fn linked_files_info_counts_distinct_existing_files() {
        let dir = temp_dir("size");
        let a = source(&dir, "a.mp3", &[0u8; 1000], "x");
        let b = source(&dir, "b.png", &[0u8; 2500], "x");
        let text = source(&dir, "c.txt", &[0u8; 9], "x");
        let gone = dir.join("gone.mp4").to_string_lossy().into_owned();
        let info = linked_files_info(&[a.path.clone(), a.path, b.path, text.path, gone]);
        assert_eq!(
            info,
            LinkedFilesInfo {
                bytes: 3500,
                count: 2,
                missing: 2
            }
        );
    }
}
