//! 7z archive extraction and completeness checks for Comfy portable install.

use crate::comfy::paths;
use crate::process_cmd;
use sevenz_rust2::{ArchiveReader, Password};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};
use tauri::AppHandle;

pub(crate) fn find_7z_exe() -> Option<PathBuf> {
    const CANDIDATES: &[&str] = &[
        r"C:\Program Files\7-Zip\7z.exe",
        r"C:\Program Files (x86)\7-Zip\7z.exe",
    ];
    for candidate in CANDIDATES {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

pub(crate) fn extract_with_sevenz_cli(
    app: &AppHandle,
    archive: &Path,
    dest: &Path,
) -> Result<(), String> {
    let seven = find_7z_exe().ok_or_else(|| "7-Zip not found".to_string())?;
    paths::emit_progress(
        app,
        "extract",
        &format!("Extracting with {}…", seven.display()),
    );
    let mut child = process_cmd::new(&seven)
        .args([
            "x",
            archive
                .to_str()
                .ok_or_else(|| "invalid archive path".to_string())?,
            &format!("-o{}", dest.display()),
            "-y",
            "-bsp1",
            "-bso1",
            "-bse1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run 7z: {e}"))?;

    let stderr_thread = child.stderr.take().map(|mut s| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = s.read_to_string(&mut buf);
            buf
        })
    });

    let mut last_emit = Instant::now()
        .checked_sub(Duration::from_secs(1))
        .unwrap_or_else(Instant::now);
    if let Some(mut out) = child.stdout.take() {
        let mut buf = [0u8; 256];
        let mut acc = String::new();
        loop {
            let n = out.read(&mut buf).map_err(|e| format!("7z stdout: {e}"))?;
            if n == 0 {
                break;
            }
            for &b in &buf[..n] {
                if b == b'\r' || b == b'\n' {
                    if let Some(msg) = parse_7z_progress_line(&acc) {
                        if last_emit.elapsed() >= Duration::from_millis(400) {
                            paths::emit_progress(app, "extract", &msg);
                            last_emit = Instant::now();
                        }
                    }
                    acc.clear();
                } else if b.is_ascii() {
                    acc.push(b as char);
                }
            }
        }
        if let Some(msg) = parse_7z_progress_line(&acc) {
            paths::emit_progress(app, "extract", &msg);
        }
    }

    let status = child.wait().map_err(|e| format!("7z wait failed: {e}"))?;
    let stderr = stderr_thread
        .and_then(|t| t.join().ok())
        .unwrap_or_default();
    if !status.success() {
        return Err(format!("7z extract failed: {stderr}"));
    }
    paths::emit_progress(app, "extract", "Extract complete");
    Ok(())
}

/// Parse 7-Zip `-bsp1` progress lines like `"  45%"` or `"  45% 1234"`.
fn parse_7z_progress_line(line: &str) -> Option<String> {
    let t = line.trim();
    if t.is_empty() {
        return None;
    }
    let pct_token = t
        .split_whitespace()
        .find(|p| p.ends_with('%'))?
        .trim_end_matches('%');
    let pct: u32 = pct_token.parse().ok()?;
    if pct > 100 {
        return None;
    }
    Some(format!("Extracting… {pct}%"))
}

/// Pure-Rust extract via sevenz-rust2 (no system 7-Zip required).
pub(crate) fn extract_with_rust(
    app: &AppHandle,
    archive: &Path,
    dest: &Path,
) -> Result<(), String> {
    paths::emit_progress(
        app,
        "extract",
        "Extracting with built-in Rust 7z (sevenz-rust2)…",
    );

    let mut reader = ArchiveReader::open(archive, Password::empty()).map_err(|e| e.to_string())?;
    if let Ok(n) = std::thread::available_parallelism() {
        reader.set_thread_count(n.get() as u32);
    }

    let mut extracted = 0u64;
    let mut last_emit = Instant::now()
        .checked_sub(Duration::from_secs(1))
        .unwrap_or_else(Instant::now);

    reader
        .for_each_entries(|entry, reader| {
            let out = dest.join(entry.name());
            sevenz_rust2::default_entry_extract_fn(entry, reader, &out)?;
            if !entry.is_directory() {
                extracted += 1;
                if last_emit.elapsed() >= Duration::from_secs(1) {
                    paths::emit_progress(
                        app,
                        "extract",
                        &format!("Extracting… {extracted} files written"),
                    );
                    last_emit = Instant::now();
                }
            }
            Ok(true)
        })
        .map_err(|e| e.to_string())?;

    paths::emit_progress(
        app,
        "extract",
        &format!("Extract complete ({extracted} files)"),
    );
    Ok(())
}

pub(crate) fn extract_7z(app: &AppHandle, archive: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;

    // Optional boost when 7-Zip is installed; otherwise pure Rust always works.
    if find_7z_exe().is_some() {
        match extract_with_sevenz_cli(app, archive, dest) {
            Ok(()) => return Ok(()),
            Err(err) => {
                paths::emit_progress(
                    app,
                    "extract",
                    &format!("System 7-Zip failed ({err}) - falling back to Rust extractor…"),
                );
                if dest.exists() {
                    let _ = fs::remove_dir_all(dest);
                    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    extract_with_rust(app, archive, dest)
}

pub fn archive_looks_complete(archive: &Path) -> bool {
    archive.is_file()
        && fs::metadata(archive)
            .map(|m| m.len() > 1_500_000_000)
            .unwrap_or(false)
}
