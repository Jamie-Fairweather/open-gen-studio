//! Rewrite absolute paths stored in SQLite after the data root moves.

use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

/// Replace `from` path prefixes with `to` across tables that store absolute paths.
pub fn rewrite_data_root_paths(conn: &Connection, from: &Path, to: &Path) -> Result<u64, String> {
    let pairs = path_rewrite_pairs(from, to);
    if pairs.is_empty() {
        return Ok(0);
    }

    let statements = [
        "UPDATE gallery_items SET path = REPLACE(path, ?1, ?2) WHERE instr(path, ?1) = 1",
        "UPDATE gallery_items SET thumbnail_path = REPLACE(thumbnail_path, ?1, ?2) WHERE thumbnail_path IS NOT NULL AND instr(thumbnail_path, ?1) = 1",
        "UPDATE gallery_items SET metadata_json = REPLACE(metadata_json, ?1, ?2) WHERE metadata_json IS NOT NULL AND instr(metadata_json, ?1) > 0",
        "UPDATE runtime_installs SET install_path = REPLACE(install_path, ?1, ?2) WHERE instr(install_path, ?1) = 1",
        "UPDATE jobs SET params_json = REPLACE(params_json, ?1, ?2) WHERE instr(params_json, ?1) > 0",
        "UPDATE download_steps SET spec_json = REPLACE(spec_json, ?1, ?2) WHERE instr(spec_json, ?1) > 0",
    ];

    let mut changed = 0u64;
    for (old, new) in &pairs {
        if old == new {
            continue;
        }
        for sql in statements {
            let n = conn
                .execute(sql, params![old, new])
                .map_err(|e| e.to_string())? as u64;
            changed += n;
        }
    }
    Ok(changed)
}

/// Open the DB file at `db_path` and rewrite path prefixes.
pub fn rewrite_data_root_paths_at(db_path: &Path, from: &Path, to: &Path) -> Result<u64, String> {
    if !db_path.is_file() {
        return Ok(0);
    }
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    rewrite_data_root_paths(&conn, from, to)
}

fn path_rewrite_pairs(from: &Path, to: &Path) -> Vec<(String, String)> {
    let from_s = from.to_string_lossy().to_string();
    let to_s = to.to_string_lossy().to_string();
    let mut pairs = Vec::new();
    push_pair(&mut pairs, &from_s, &to_s);
    // JSON / YAML often use forward slashes even on Windows.
    let from_fwd = from_s.replace('\\', "/");
    let to_fwd = to_s.replace('\\', "/");
    push_pair(&mut pairs, &from_fwd, &to_fwd);
    let from_back = from_s.replace('/', "\\");
    let to_back = to_s.replace('/', "\\");
    push_pair(&mut pairs, &from_back, &to_back);
    // JSON strings escape backslashes (`C:\\Users\\…`).
    let from_json = from_back.replace('\\', "\\\\");
    let to_json = to_back.replace('\\', "\\\\");
    push_pair(&mut pairs, &from_json, &to_json);
    pairs
}

fn push_pair(out: &mut Vec<(String, String)>, from: &str, to: &str) {
    if from.is_empty() || from == to {
        return;
    }
    if out.iter().any(|(a, b)| a == from && b == to) {
        return;
    }
    out.push((from.to_string(), to.to_string()));
}

/// If `stored` is missing, try the same relative path under `gallery_root`.
pub fn remap_gallery_file(stored: &str, gallery_root: &Path) -> Option<PathBuf> {
    let stored_path = PathBuf::from(stored);
    if stored_path.is_file() {
        return None;
    }
    let normalized = stored.replace('\\', "/");
    if let Some(idx) = normalized.rfind("/gallery/") {
        let rel = &normalized[idx + "/gallery/".len()..];
        if !rel.is_empty() {
            let candidate = gallery_root.join(rel);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    if let Some(name) = stored_path.file_name() {
        let candidate = gallery_root.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::path::PathBuf;

    #[test]
    fn rewrites_gallery_and_runtime_paths() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE gallery_items (
                id TEXT PRIMARY KEY, job_id TEXT, path TEXT NOT NULL,
                thumbnail_path TEXT, metadata_json TEXT, created_at INTEGER
             );
             CREATE TABLE runtime_installs (
                id TEXT PRIMARY KEY, engine TEXT, version TEXT,
                install_path TEXT NOT NULL, port INTEGER, status TEXT,
                error TEXT, created_at INTEGER, updated_at INTEGER
             );
             CREATE TABLE jobs (
                id TEXT PRIMARY KEY, status TEXT, kind TEXT,
                params_json TEXT NOT NULL, error TEXT,
                created_at INTEGER, updated_at INTEGER, queue_order INTEGER
             );
             CREATE TABLE download_steps (
                id TEXT PRIMARY KEY, job_id TEXT, idx INTEGER,
                step_kind TEXT, label TEXT, spec_json TEXT NOT NULL,
                status TEXT, bytes_done INTEGER, bytes_total INTEGER,
                error TEXT, updated_at INTEGER
             );",
        )
        .unwrap();

        let from = PathBuf::from(r"C:\Old\Open Gen Studio");
        let to = PathBuf::from(r"I:\OpenGenStudio");
        conn.execute(
            "INSERT INTO gallery_items VALUES ('g1', NULL, ?1, ?2, '{}', 0)",
            params![
                r"C:\Old\Open Gen Studio\gallery\a.png",
                r"C:\Old\Open Gen Studio\gallery\thumbs\a.png"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO runtime_installs VALUES ('r1', 'comfyui', 'v1', ?1, 8188, 'ready', NULL, 0, 0)",
            params![r"C:\Old\Open Gen Studio\runtimes\comfyui"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO jobs VALUES ('j1', 'done', 'generate', ?1, NULL, 0, 0, 0)",
            params![r#"{"imagePath":"C:\\Old\\Open Gen Studio\\gallery\\a.png"}"#],
        )
        .unwrap();

        let n = rewrite_data_root_paths(&conn, &from, &to).unwrap();
        assert!(n >= 4);

        let path: String = conn
            .query_row("SELECT path FROM gallery_items WHERE id='g1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(path.starts_with(r"I:\OpenGenStudio"), "{path}");
        let install: String = conn
            .query_row(
                "SELECT install_path FROM runtime_installs WHERE id='r1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(install.contains(r"I:\OpenGenStudio"), "{install}");
        let params: String = conn
            .query_row("SELECT params_json FROM jobs WHERE id='j1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(
            params.contains(r"I:\\OpenGenStudio") || params.contains(r"I:\OpenGenStudio"),
            "{params}"
        );
    }

    #[test]
    fn remaps_missing_gallery_file_under_new_root() {
        let gallery =
            std::env::temp_dir().join(format!("oga-gallery-remap-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&gallery);
        let day = gallery.join("2026-01-01");
        std::fs::create_dir_all(&day).unwrap();
        let file = day.join("car.png");
        std::fs::write(&file, b"x").unwrap();

        let stale = r"C:\Users\jamie\AppData\Roaming\test\gallery\2026-01-01\car.png";
        let remapped = remap_gallery_file(stale, &gallery).unwrap();
        assert_eq!(remapped, file);
        assert!(remap_gallery_file(file.to_str().unwrap(), &gallery).is_none());
        let _ = std::fs::remove_dir_all(&gallery);
    }
}
