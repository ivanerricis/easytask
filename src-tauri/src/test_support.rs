//! Helpers shared by the unit tests of the modules.

/// A fresh, empty-or-existing folder in the system temp folder, unique per process and name.
pub(crate) fn temp_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("easytask-test-{}-{name}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// A mono 16 bit WAV with a sine of `freq` Hz, `seconds` long, whose peak is `peak_dbfs` dBFS.
pub(crate) fn write_sine_wav(
    path: &std::path::Path,
    rate: u32,
    seconds: u32,
    freq: f64,
    peak_dbfs: f64,
) {
    let frames = rate * seconds;
    let data_len = frames * 2;
    let amplitude = 10f64.powf(peak_dbfs / 20.0) * 32767.0;
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&rate.to_le_bytes());
    bytes.extend_from_slice(&(rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    for n in 0..frames {
        let phase = 2.0 * std::f64::consts::PI * freq * f64::from(n) / f64::from(rate);
        bytes.extend_from_slice(&((phase.sin() * amplitude).round() as i16).to_le_bytes());
    }
    std::fs::write(path, bytes).unwrap();
}
