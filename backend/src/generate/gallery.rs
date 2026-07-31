use crate::db::{GalleryItem, RuntimeInstall};
use crate::generate::types::ComfyImageRef;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use uuid::Uuid;

pub fn gallery_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::app_paths::app_data_dir(app)?.join("gallery"))
}

pub fn previews_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::app_paths::app_data_dir(app)?.join("previews"))
}

/// `gallery/YYYY-MM-DD` (local calendar day).
pub(crate) fn gallery_day_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let day = chrono::Local::now().format("%Y-%m-%d").to_string();
    Ok(gallery_dir(app)?.join(day))
}

/// Gallery-grid JPEG under `previews/` - keeps the rail from decoding full 2K–4K PNGs.
const GALLERY_THUMB_MAX: u32 = 384;

fn legacy_sidecar_thumb(image_path: &Path) -> PathBuf {
    let stem = image_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    image_path.with_file_name(format!("{stem}.thumb.jpg"))
}

/// `gallery/<folder>/<stem>.png` → `previews/<folder>/<stem>.thumb.jpg`
fn gallery_thumbnail_path(previews_root: &Path, image_path: &Path) -> PathBuf {
    let stem = image_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let filename = format!("{stem}.thumb.jpg");
    match image_path.parent().and_then(|p| p.file_name()) {
        Some(folder) => previews_root.join(folder).join(filename),
        None => previews_root.join(filename),
    }
}

fn relocate_thumb(from: &Path, dest: &Path) -> bool {
    if !from.is_file() || from == dest {
        return dest.is_file();
    }
    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if fs::rename(from, dest).is_ok() {
        return true;
    }
    if fs::copy(from, dest).is_ok() {
        let _ = fs::remove_file(from);
        return dest.is_file();
    }
    false
}

/// Write (or migrate) a small JPEG under `previews/`. Returns the thumbnail path.
pub fn write_gallery_thumbnail(app: &AppHandle, image_path: &Path) -> Result<PathBuf, String> {
    if !image_path.is_file() {
        return Err(format!("gallery image missing: {}", image_path.display()));
    }
    let dest = gallery_thumbnail_path(&previews_dir(app)?, image_path);
    if dest.is_file() {
        return Ok(dest);
    }
    if relocate_thumb(&legacy_sidecar_thumb(image_path), &dest) {
        return Ok(dest);
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create previews dir: {e}"))?;
    }
    let img = image::open(image_path).map_err(|e| format!("open gallery image: {e}"))?;
    let thumb = img.thumbnail(GALLERY_THUMB_MAX, GALLERY_THUMB_MAX);
    thumb
        .save_with_format(&dest, image::ImageFormat::Jpeg)
        .map_err(|e| format!("write gallery thumbnail: {e}"))?;
    Ok(dest)
}

/// Ensure each item has a usable thumbnail under `previews/`.
/// Returns updated items plus `(id, thumb_path)` pairs that should be persisted.
pub fn ensure_gallery_thumbnails(
    app: &AppHandle,
    items: Vec<GalleryItem>,
) -> (Vec<GalleryItem>, Vec<(String, String)>) {
    let Ok(previews) = previews_dir(app) else {
        return (items, Vec::new());
    };
    let mut out = Vec::with_capacity(items.len());
    let mut updates = Vec::new();
    for mut item in items {
        let image = Path::new(&item.path);
        let dest = gallery_thumbnail_path(&previews, image);
        let dest_s = dest.display().to_string();
        let already = item.thumbnail_path.as_deref() == Some(dest_s.as_str()) && dest.is_file();
        if already {
            out.push(item);
            continue;
        }
        if !dest.is_file() {
            if let Some(old) = item.thumbnail_path.as_deref().map(Path::new) {
                let _ = relocate_thumb(old, &dest);
            }
        }
        match if dest.is_file() {
            Ok(dest.clone())
        } else {
            write_gallery_thumbnail(app, image)
        } {
            Ok(thumb) => {
                let path = thumb.display().to_string();
                if item.thumbnail_path.as_deref() != Some(path.as_str()) {
                    updates.push((item.id.clone(), path.clone()));
                    item.thumbnail_path = Some(path);
                }
            }
            Err(e) => {
                log::warn!("gallery thumbnail skipped for {}: {e}", item.id);
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
