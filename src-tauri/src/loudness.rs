//! Loudness of an audio file (EBU R128): integrated LUFS, true peak, loudness range, a 10 Hz curve of the
//! short-term and momentary loudness for the player meter, and the waveform peaks. The file is decoded with
//! symphonia and measured with ebur128; the result is cached as JSON in the data folder.

use crate::files::is_audio_file;
use crate::paths::DataDirInfo;
use ebur128::{EbuR128, Mode};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

/// Points per second of the loudness curves.
const CURVE_HZ: u32 = 10;
/// Values below this (silence) are reported as this floor, in LUFS / dBTP.
const FLOOR_DB: f64 = -70.0;
/// Waveform resolution: at most this many min/max pairs.
const MAX_PEAK_PAIRS: usize = 1000;
/// The waveform is first collected in chunks of 1/PEAK_CHUNKS_PER_SECOND s, then merged down to MAX_PEAK_PAIRS.
const PEAK_CHUNKS_PER_SECOND: u64 = 100;
/// Bump when the measurement changes, so older cache files are not used.
const CACHE_VERSION: u32 = 1;

/// The measurement of one file (camelCase for the JS side; also the format of the cache file).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoudnessReport {
    /// Integrated loudness, LUFS. None for a silent file.
    integrated_lufs: Option<f64>,
    /// Highest true peak, dBTP. None for a silent file.
    true_peak_dbtp: Option<f64>,
    /// Loudness range, LU.
    lra: f64,
    /// Points per second of the three curves below.
    curve_hz: u32,
    /// Short-term (3 s window) loudness, LUFS, one value per 1/curve_hz s.
    short_term: Vec<f32>,
    /// Momentary (400 ms window) loudness, LUFS.
    momentary: Vec<f32>,
    /// Highest true peak so far, dBTP.
    true_peak: Vec<f32>,
    /// Waveform: min and max of each slice of the file, interleaved (min0, max0, min1, max1, ...), -1..1.
    peaks: Vec<f32>,
    duration_ms: u64,
}

fn db_floor(value: f64) -> f64 {
    if value.is_finite() {
        value.max(FLOOR_DB)
    } else {
        FLOOR_DB
    }
}

/// One decimal is plenty for a meter and keeps the JSON small.
fn round1(value: f64) -> f32 {
    ((db_floor(value) * 10.0).round() / 10.0) as f32
}

fn to_db(linear: f64) -> f64 {
    20.0 * linear.log10()
}

/// Min/max collector of the waveform.
struct Peaks {
    chunk_frames: u64,
    count: u64,
    min: f32,
    max: f32,
    chunks: Vec<(f32, f32)>,
}

impl Peaks {
    fn new(rate: u32) -> Self {
        Peaks {
            chunk_frames: (u64::from(rate) / PEAK_CHUNKS_PER_SECOND).max(1),
            count: 0,
            min: f32::MAX,
            max: f32::MIN,
            chunks: Vec::new(),
        }
    }

    fn push(&mut self, sample: f32) {
        self.min = self.min.min(sample);
        self.max = self.max.max(sample);
        self.count += 1;
        if self.count == self.chunk_frames {
            self.flush();
        }
    }

    fn flush(&mut self) {
        if self.count > 0 {
            self.chunks.push((self.min, self.max));
        }
        self.count = 0;
        self.min = f32::MAX;
        self.max = f32::MIN;
    }

    /// Merges the chunks down to at most MAX_PEAK_PAIRS pairs, flattened.
    fn finish(mut self) -> Vec<f32> {
        self.flush();
        let total = self.chunks.len();
        let buckets = total.min(MAX_PEAK_PAIRS);
        let mut out = Vec::with_capacity(buckets * 2);
        for bucket in 0..buckets {
            let from = bucket * total / buckets;
            let to = ((bucket + 1) * total / buckets).max(from + 1);
            let (min, max) = self.chunks[from..to]
                .iter()
                .fold((f32::MAX, f32::MIN), |(lo, hi), (a, b)| {
                    (lo.min(*a), hi.max(*b))
                });
            out.push((min.clamp(-1.0, 1.0) * 1000.0).round() / 1000.0);
            out.push((max.clamp(-1.0, 1.0) * 1000.0).round() / 1000.0);
        }
        out
    }
}

/// Highest true peak (linear) over all the channels so far.
fn max_true_peak(meter: &EbuR128, channels: usize) -> f64 {
    (0..channels as u32)
        .filter_map(|channel| meter.true_peak(channel).ok())
        .fold(0.0_f64, f64::max)
}

/// Decodes the whole file and measures it. Corrupt or unsupported files are an Err.
fn measure(path: &Path) -> Result<LoudnessReport, String> {
    let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
        hint.with_extension(extension);
    }
    let mut format = symphonia::default::get_probe()
        .probe(
            &hint,
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|error| format!("unsupported audio file: {error}"))?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or_else(|| "no audio track".to_string())?;
    let track_id = track.id;
    let params = track
        .codec_params
        .as_ref()
        .and_then(|params| params.audio())
        .ok_or_else(|| "no audio track".to_string())?;
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default())
        .map_err(|error| format!("unsupported audio codec: {error}"))?;

    let mut meter: Option<EbuR128> = None;
    let mut spec: Option<(u32, usize)> = None;
    let mut peaks: Option<Peaks> = None;
    let mut interleaved: Vec<f32> = Vec::new();
    let (mut short_term, mut momentary, mut true_peak) = (Vec::new(), Vec::new(), Vec::new());
    let mut total_frames: u64 = 0;
    let mut ticks: u64 = 0;

    // The loop ends with the stream, or at a truncated file: what was decoded is kept
    while let Ok(Some(packet)) = format.next_packet() {
        if packet.track_id != track_id {
            continue;
        }
        let buffer = match decoder.decode(&packet) {
            Ok(buffer) => buffer,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(_) => break,
        };
        let rate = buffer.spec().rate();
        let channels = buffer.spec().channels().count();
        let frames = buffer.frames();
        if frames == 0 {
            continue;
        }
        let (rate0, channels0) = match spec {
            Some(known) => known,
            None => {
                if rate == 0 || channels == 0 {
                    return Err("invalid audio format".to_string());
                }
                let mode = Mode::I | Mode::S | Mode::M | Mode::TRUE_PEAK | Mode::LRA;
                meter = Some(
                    EbuR128::new(
                        u32::try_from(channels).map_err(|error| error.to_string())?,
                        rate,
                        mode,
                    )
                    .map_err(|error| error.to_string())?,
                );
                peaks = Some(Peaks::new(rate));
                spec = Some((rate, channels));
                (rate, channels)
            }
        };
        if rate != rate0 || channels != channels0 {
            // The format changed in the middle of the stream: the rest is not measured
            break;
        }
        interleaved.resize(buffer.samples_interleaved(), 0.0);
        buffer.copy_to_slice_interleaved(&mut interleaved);
        let (Some(meter), Some(peaks)) = (meter.as_mut(), peaks.as_mut()) else {
            continue;
        };

        let mut position = 0usize;
        while position < frames {
            // Feed up to the next curve point, so each point is read exactly at its time
            let next_point = (ticks + 1) * u64::from(rate0) / u64::from(CURVE_HZ);
            let until_point = usize::try_from(next_point.saturating_sub(total_frames).max(1))
                .unwrap_or(usize::MAX);
            let take = (frames - position).min(until_point);
            let slice = &interleaved[position * channels0..(position + take) * channels0];
            meter
                .add_frames_f32(slice)
                .map_err(|error| error.to_string())?;
            for frame in slice.chunks_exact(channels0) {
                peaks.push(frame.iter().sum::<f32>() / channels0 as f32);
            }
            position += take;
            total_frames += take as u64;
            if total_frames >= next_point {
                ticks += 1;
                momentary.push(round1(
                    meter.loudness_momentary().unwrap_or(f64::NEG_INFINITY),
                ));
                short_term.push(round1(
                    meter.loudness_shortterm().unwrap_or(f64::NEG_INFINITY),
                ));
                true_peak.push(round1(to_db(max_true_peak(meter, channels0))));
            }
        }
    }

    let (Some(meter), Some(peaks), Some((rate, channels))) = (meter, peaks, spec) else {
        return Err("no audio could be decoded".to_string());
    };
    let integrated = meter
        .loudness_global()
        .ok()
        .filter(|value| value.is_finite());
    let peak = max_true_peak(&meter, channels);
    let tenth = |value: f64| (value * 10.0).round() / 10.0;
    Ok(LoudnessReport {
        integrated_lufs: integrated.map(tenth),
        true_peak_dbtp: (peak > 0.0).then(|| tenth(to_db(peak))),
        lra: tenth(meter.loudness_range().unwrap_or(0.0).max(0.0)),
        curve_hz: CURVE_HZ,
        short_term,
        momentary,
        true_peak,
        peaks: peaks.finish(),
        duration_ms: total_frames * 1000 / u64::from(rate),
    })
}

/// FNV-1a: stable across Rust versions, unlike `DefaultHasher`.
fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

/// `<data folder>/loudness/<hash of path + size + mtime>.json`: changes whenever the file does.
fn cache_file(data_dir: &Path, path: &Path) -> Result<PathBuf, String> {
    let meta = std::fs::metadata(path).map_err(|error| error.to_string())?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_millis());
    let key = format!(
        "v{CACHE_VERSION}|{}|{}|{modified}",
        path.to_string_lossy(),
        meta.len()
    );
    Ok(data_dir
        .join("loudness")
        .join(format!("{:016x}.json", fnv1a(key.as_bytes()))))
}

/// Cached measurement when there is one; otherwise measures and stores it (atomically; a cache that cannot be
/// written is not an error).
fn measure_cached(data_dir: &Path, path: &Path) -> Result<LoudnessReport, String> {
    let cache = cache_file(data_dir, path)?;
    if let Some(report) = std::fs::read(&cache)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<LoudnessReport>(&bytes).ok())
    {
        return Ok(report);
    }
    let report = measure(path)?;
    if let (Some(folder), Ok(json)) = (cache.parent(), serde_json::to_vec(&report)) {
        let temp = cache.with_extension("json.tmp");
        if std::fs::create_dir_all(folder).is_ok()
            && std::fs::write(&temp, json).is_ok()
            && std::fs::rename(&temp, &cache).is_err()
        {
            let _ = std::fs::remove_file(&temp);
        }
    }
    Ok(report)
}

/// Loudness (integrated LUFS, true peak, LRA), curves and waveform of an audio file. Read-only (apart from the
/// cache in the data folder); only existing files with an audio extension are accepted, and the work runs outside
/// the UI thread.
#[tauri::command]
pub(crate) async fn audio_loudness(
    path: String,
    info: tauri::State<'_, DataDirInfo>,
) -> Result<LoudnessReport, String> {
    if !is_audio_file(&path) {
        return Err("audio file not found".to_string());
    }
    let data_dir = info.path.clone();
    tauri::async_runtime::spawn_blocking(move || measure_cached(&data_dir, Path::new(&path)))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{temp_dir, write_sine_wav};

    #[test]
    fn measures_a_known_sine() {
        let dir = temp_dir("loud-sine");
        let file = dir.join("sine.wav");
        // Mono 1 kHz sine, peak -20 dBFS: mean square -23.01 dB, K-weighting is ~0 dB at 1 kHz => about -23 LUFS
        write_sine_wav(&file, 48000, 5, 1000.0, -20.0);
        let report = measure(&file).unwrap();
        let lufs = report.integrated_lufs.unwrap();
        assert!((lufs + 23.0).abs() < 0.3, "integrated {lufs}");
        let peak = report.true_peak_dbtp.unwrap();
        assert!((peak + 20.0).abs() < 0.3, "true peak {peak}");
        assert!(report.lra < 0.5, "lra {}", report.lra);
        assert_eq!(report.curve_hz, 10);
        assert_eq!(report.duration_ms, 5000);
        assert_eq!(report.momentary.len(), 50);
        assert_eq!(report.short_term.len(), 50);
        assert_eq!(report.true_peak.len(), 50);
        // The windows are not full yet at the start: the meter reads lower (as a real-time meter does)
        assert!(
            report.momentary[0] < -25.0,
            "momentary at start {}",
            report.momentary[0]
        );
        assert!(
            report.short_term[10] < -26.0,
            "short-term at 1 s {}",
            report.short_term[10]
        );
        assert!((f64::from(report.momentary[49]) + 23.0).abs() < 0.3);
        assert!((f64::from(report.short_term[49]) + 23.0).abs() < 0.3);
        // Waveform: 500 slices of 10 ms, amplitude 0.1
        assert_eq!(report.peaks.len(), 1000);
        let top = report.peaks.chunks(2).map(|p| p[1]).fold(0.0_f32, f32::max);
        assert!((top - 0.1).abs() < 0.005, "top {top}");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn silence_has_no_integrated_loudness() {
        let dir = temp_dir("loud-silence");
        let file = dir.join("silence.wav");
        write_sine_wav(&file, 44100, 1, 1000.0, -200.0);
        let report = measure(&file).unwrap();
        assert_eq!(report.integrated_lufs, None);
        assert_eq!(report.true_peak_dbtp, None);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn cache_is_written_and_reused() {
        let dir = temp_dir("loud-cache");
        let file = dir.join("sine.wav");
        write_sine_wav(&file, 48000, 2, 1000.0, -20.0);
        let data = dir.join("data");
        let first = measure_cached(&data, &file).unwrap();
        let cached = cache_file(&data, &file).unwrap();
        assert!(cached.is_file());
        // A tampered cache entry is the one returned: proves the cache is read
        let mut edited = first.clone();
        edited.lra = 42.0;
        std::fs::write(&cached, serde_json::to_vec(&edited).unwrap()).unwrap();
        assert_eq!(measure_cached(&data, &file).unwrap().lra, 42.0);
        // A broken cache entry is measured again
        std::fs::write(&cached, b"{ nope").unwrap();
        assert_eq!(measure_cached(&data, &file).unwrap().lra, first.lra);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn corrupt_or_missing_files_are_errors() {
        let dir = temp_dir("loud-bad");
        for name in [
            "broken.mp3",
            "broken.wav",
            "broken.flac",
            "broken.ogg",
            "broken.m4a",
        ] {
            let file = dir.join(name);
            std::fs::write(&file, b"this is not audio at all, just some text bytes").unwrap();
            assert!(measure(&file).is_err(), "{name}");
        }
        let empty = dir.join("empty.mp3");
        std::fs::write(&empty, b"").unwrap();
        assert!(measure(&empty).is_err());
        assert!(measure(&dir.join("gone.mp3")).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn truncated_wav_does_not_panic() {
        let dir = temp_dir("loud-trunc");
        let file = dir.join("cut.wav");
        write_sine_wav(&file, 48000, 3, 1000.0, -20.0);
        let bytes = std::fs::read(&file).unwrap();
        std::fs::write(&file, &bytes[..bytes.len() / 2]).unwrap();
        // Either a shorter measurement or an error
        let _ = measure(&file);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn command_check_rejects_wrong_extension_and_missing_file() {
        // The extension / regular-file check runs before the data folder is touched
        let dir = temp_dir("loud-cmd");
        let text = dir.join("notes.txt");
        std::fs::write(&text, b"x").unwrap();
        assert!(!is_audio_file(text.to_str().unwrap()));
        assert!(!is_audio_file(dir.join("gone.mp3").to_str().unwrap()));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
