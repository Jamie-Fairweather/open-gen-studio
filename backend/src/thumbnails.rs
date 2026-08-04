//! Shared pack thumbnails (`thumbnail.png` / `.jpg` / `.webp` in a pack directory).

use std::fs;
use std::path::{Path, PathBuf};

const CANDIDATES: &[&str] = &[
    "thumbnail.png",
    "thumbnail.jpg",
    "thumbnail.jpeg",
    "thumbnail.webp",
];

pub fn find_in_dir(dir: &Path) -> Option<PathBuf> {
    CANDIDATES
        .iter()
        .map(|name| dir.join(name))
        .find(|path| path.is_file())
}

fn normalize_ext(ext: &str) -> Result<&'static str, String> {
    match ext
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => Ok("png"),
        "jpg" | "jpeg" => Ok("jpg"),
        "webp" => Ok("webp"),
        other => Err(format!(
            "unsupported thumbnail type '{other}' - use png, jpg, or webp"
        )),
    }
}

/// Write `thumbnail.<ext>` into `dir`, removing any prior thumbnail variants.
pub fn write_in_dir(dir: &Path, bytes: &[u8], ext: &str) -> Result<PathBuf, String> {
    if bytes.is_empty() {
        return Err("empty image data".into());
    }
    if !dir.is_dir() {
        return Err("pack directory does not exist".into());
    }
    let safe_ext = normalize_ext(ext)?;
    clear_in_dir(dir)?;
    let dest = dir.join(format!("thumbnail.{safe_ext}"));
    fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    Ok(dest)
}

pub fn clear_in_dir(dir: &Path) -> Result<(), String> {
    for name in CANDIDATES {
        let path = dir.join(name);
        if path.is_file() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
