//! Helpers shared by the unit tests of the modules.

/// A fresh, empty-or-existing folder in the system temp folder, unique per process and name.
pub(crate) fn temp_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("easytask-test-{}-{name}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}
