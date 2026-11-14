//! Properties and tags of an audio file, for the details panel.

use crate::files::is_audio_file;
use std::path::Path;

/// Largest cover art (bytes) returned by `audio_metadata`; bigger pictures are left out to keep the reply small.
const MAX_COVER_BYTES: usize = 2 * 1024 * 1024;

/// Everything `audio_metadata` can tell about an audio file (camelCase for the JS side). Every field that may be
/// missing from the file is an Option.
#[derive(Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioMetadata {
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
pub(crate) async fn audio_metadata(path: String) -> Result<AudioMetadata, String> {
    if !is_audio_file(&path) {
        return Err("audio file not found".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || read_audio_metadata(Path::new(&path)))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::temp_dir;

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
}
