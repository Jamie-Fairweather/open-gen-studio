use crate::db::{GalleryItem, RuntimeInstall};
use crate::generate::types::ComfyImageRef;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub fn gallery_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("gallery"))
}

/// `gallery/YYYY-MM-DD` (local calendar day).
pub(crate) fn gallery_day_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let day = chrono::Local::now().format("%Y-%m-%d").to_string();
    Ok(gallery_dir(app)?.join(day))
}

/// Sidecar JPEG for the gallery grid - keeps the rail from decoding full 2K–4K PNGs.
const GALLERY_THUMB_MAX: u32 = 384;

fn gallery_thumbnail_path(image_path: &Path) -> PathBuf {
    let stem = image_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    image_path.with_file_name(format!("{stem}.thumb.jpg"))
}

/// Write a small JPEG next to `image_path`. Returns the thumbnail path.
pub fn write_gallery_thumbnail(image_path: &Path) -> Result<PathBuf, String> {
    if !image_path.is_file() {
        return Err(format!("gallery image missing: {}", image_path.display()));
    }
    let dest = gallery_thumbnail_path(image_path);
    if dest.is_file() {
        return Ok(dest);
    }
    let img = image::open(image_path).map_err(|e| format!("open gallery image: {e}"))?;
    let thumb = img.thumbnail(GALLERY_THUMB_MAX, GALLERY_THUMB_MAX);
    thumb
        .save_with_format(&dest, image::ImageFormat::Jpeg)
        .map_err(|e| format!("write gallery thumbnail: {e}"))?;
    Ok(dest)
}

/// Ensure each item has a usable on-disk thumbnail.
/// Returns updated items plus `(id, thumb_path)` pairs that should be persisted.
pub fn ensure_gallery_thumbnails(
    items: Vec<GalleryItem>,
) -> (Vec<GalleryItem>, Vec<(String, String)>) {
    let mut out = Vec::with_capacity(items.len());
    let mut updates = Vec::new();
    for mut item in items {
        let thumb_ok = item
            .thumbnail_path
            .as_deref()
            .map(|p| Path::new(p).is_file())
            .unwrap_or(false);
        if !thumb_ok {
            match write_gallery_thumbnail(Path::new(&item.path)) {
                Ok(thumb) => {
                    let path = thumb.display().to_string();
                    updates.push((item.id.clone(), path.clone()));
                    item.thumbnail_path = Some(path);
                }
                Err(e) => {
                    log::warn!("gallery thumbnail skipped for {}: {e}", item.id);
                }
            }
        }
        out.push(item);
    }
    (out, updates)
}

/// Comfy-style name: `{prefix}_{NNNNN}_.ext` with a day-folder counter.
/// (Deleting Comfy's output makes it reuse `00001_`, so we own the sequence.)
pub(crate) fn next_gallery_dest(dir: &Path, prefix: &str, ext: &str) -> PathBuf {
    let prefix = {
        let p = prefix.trim();
        if p.is_empty() {
            "image"
        } else {
            p
        }
    };
    let ext = ext.trim_start_matches('.');
    let ext = if ext.is_empty() { "png" } else { ext };
    let mut max = 0u32;
    if let Ok(entries) = fs::read_dir(dir) {
        for ent in entries.flatten() {
            let name = ent.file_name();
            let Some(name) = name.to_str() else { continue };
            if let Some(n) = gallery_sequence_number(name, prefix, ext) {
                max = max.max(n);
            }
        }
    }
    let mut next = max.saturating_add(1).max(1);
    loop {
        let dest = dir.join(format!("{prefix}_{next:05}_.{ext}"));
        if !dest.exists() {
            return dest;
        }
        next = next.saturating_add(1);
        if next > 99_999 {
            return dir.join(format!("{prefix}_{}_.{}", Uuid::new_v4().simple(), ext));
        }
    }
}

/// `krea2-turbo_00007_.png` → Some(7); ignores collision junk like `…_00001_2.png`.
fn gallery_sequence_number(filename: &str, prefix: &str, ext: &str) -> Option<u32> {
    let suffix = format!(".{ext}");
    if !filename.starts_with(prefix) || !filename.ends_with(&suffix) {
        return None;
    }
    let mid = &filename[prefix.len()..filename.len() - suffix.len()];
    let mid = mid.strip_prefix('_')?;
    let digits = mid.strip_suffix('_')?;
    if digits.len() == 5 && digits.bytes().all(|b| b.is_ascii_digit()) {
        digits.parse().ok()
    } else {
        None
    }
}

/// On-disk ComfyUI file for a `/view` image ref (portable layout).
pub(crate) fn comfy_disk_path(runtime: &RuntimeInstall, image: &ComfyImageRef) -> Option<PathBuf> {
    if runtime.install_path.is_empty() {
        return None;
    }
    let folder = match image.image_type.as_str() {
        "temp" => "temp",
        "input" => "input",
        _ => "output",
    };
    let mut path = PathBuf::from(&runtime.install_path)
        .join("ComfyUI")
        .join(folder);
    if !image.subfolder.is_empty() {
        // Reject path traversal in Comfy-reported subfolders.
        if image
            .subfolder
            .split(['/', '\\'])
            .any(|p| p == ".." || p.is_empty())
        {
            return None;
        }
        path.push(&image.subfolder);
    }
    if image.filename.contains("..")
        || image.filename.contains('/')
        || image.filename.contains('\\')
    {
        return None;
    }
    path.push(&image.filename);
    Some(path)
}

pub(crate) fn remove_comfy_output(runtime: &RuntimeInstall, image: &ComfyImageRef) {
    let Some(path) = comfy_disk_path(runtime, image) else {
        return;
    };
    if path.is_file() {
        let _ = fs::remove_file(path);
    }
}
