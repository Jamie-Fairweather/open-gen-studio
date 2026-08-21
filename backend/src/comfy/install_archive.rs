//! 7z archive extraction and completeness checks for Comfy portable install.

use crate::comfy::paths;
use sevenz_rust2::{ArchiveReader, Password};
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::{Duration, Instant};
use tauri::AppHandle;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(400);

fn extract_pct(extracted: u64, total: u64) -> u32 {
    if total == 0 {
        return 0;
    }
    (extracted.saturating_mul(100) / total).min(100) as u32
}

fn emit_extract_pct(app: &AppHandle, extracted: u64, total: u64) {
    paths::emit_progress(
        app,
        "extract",
        &format!("Extracting… {}%", extract_pct(extracted, total)),
    );
}

/// Counts uncompressed bytes as sevenz-rust2 streams each entry.
struct ExtractProgressRead<'a> {
    inner: &'a mut dyn Read,
    extracted: &'a mut u64,
    total: u64,
    last_emit: &'a mut Instant,
    app: &'a AppHandle,
}

impl Read for ExtractProgressRead<'_> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        if n == 0 {
            return Ok(0);
        }
        *self.extracted = self.extracted.saturating_add(n as u64);
        if self.last_emit.elapsed() >= PROGRESS_INTERVAL {
            emit_extract_pct(self.app, *self.extracted, self.total);
            *self.last_emit = Instant::now();
        }
        Ok(n)
    }
}

fn extract_archive(app: &AppHandle, archive: &Path, dest: &Path) -> Result<(), String> {
    paths::emit_progress(app, "extract", "Extracting… 0%");

    let mut reader = ArchiveReader::open(archive, Password::empty()).map_err(|e| e.to_string())?;
    if let Ok(n) = std::thread::available_parallelism() {
        reader.set_thread_count(n.get() as u32);
    }

    let total: u64 = reader.archive().files.iter().map(|e| e.size()).sum();
    let mut extracted = 0u64;
    let mut last_emit = Instant::now()
        .checked_sub(PROGRESS_INTERVAL)
        .unwrap_or_else(Instant::now);

    reader
        .for_each_entries(|entry, reader| {
            let out = dest.join(entry.name());
            let mut progress = ExtractProgressRead {
                inner: reader,
                extracted: &mut extracted,
                total,
                last_emit: &mut last_emit,
                app,
            };
            sevenz_rust2::default_entry_extract_fn(entry, &mut progress, &out)?;
            Ok(true)
        })
        .map_err(|e| e.to_string())?;

    emit_extract_pct(app, total.max(extracted), total);
    paths::emit_progress(app, "extract", "Extract complete");
    Ok(())
}

pub(crate) fn extract_7z(app: &AppHandle, archive: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    extract_archive(app, archive, dest)?;
    if !extract_looks_ready(dest) {
        return Err(
            "extract finished but python_embeded is missing python3XX.dll \
(incomplete archive or extractor failure)"
                .into(),
        );
    }
    Ok(())
}

fn extract_looks_ready(dest: &Path) -> bool {
    paths::find_portable_root(dest)
        .map(|root| paths::portable_ready(&root))
        .unwrap_or(false)
}

pub fn archive_looks_complete(archive: &Path) -> bool {
    archive.is_file()
        && fs::metadata(archive)
            .map(|m| m.len() > 1_500_000_000)
            .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_pct_zero_total() {
        assert_eq!(extract_pct(0, 0), 0);
        assert_eq!(extract_pct(10, 0), 0);
    }

    #[test]
    fn extract_pct_bounds() {
        assert_eq!(extract_pct(0, 100), 0);
        assert_eq!(extract_pct(50, 100), 50);
        assert_eq!(extract_pct(100, 100), 100);
        assert_eq!(extract_pct(200, 100), 100);
    }
}
