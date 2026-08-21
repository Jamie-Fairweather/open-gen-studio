mod downloads;
mod gallery;
mod jobs;
mod migrate;
mod path_rewrite;
mod runtimes;
mod settings;
mod types;

pub use path_rewrite::{remap_gallery_file, rewrite_data_root_paths_at};

use rusqlite::Connection;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub use types::{DownloadJobRow, DownloadStepRow, GalleryItem, Job, RuntimeInstall};

pub struct Db {
    conn: Connection,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl Db {
    pub fn open(app_data_dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        let path = app_data_dir.join("open-gen-studio.db");
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.pragma_update(None, "foreign_keys", true)
            .map_err(|e| e.to_string())?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    /// Release the on-disk SQLite handle (e.g. before relocating the data dir).
    /// Replaces the connection with an empty in-memory DB so callers can still
    /// hold `AppState` until process exit / relaunch. That memory DB has **no
    /// tables** — call [`Self::reopen`] if the process will keep serving commands.
    pub fn close_disk(&mut self) -> Result<(), String> {
        let _ = self.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        let mem = Connection::open_in_memory().map_err(|e| e.to_string())?;
        self.conn = mem;
        Ok(())
    }

    /// Open (or re-migrate) the on-disk DB after [`Self::close_disk`].
    pub fn reopen(&mut self, app_data_dir: &Path) -> Result<(), String> {
        let _ = self.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        *self = Self::open(app_data_dir)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp_dir() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("ogs-db-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn close_disk_drops_settings_until_reopen() {
        let dir = tmp_dir();
        let mut db = Db::open(&dir).unwrap();
        db.set_setting("gpu_vendor", "nvidia").unwrap();
        db.close_disk().unwrap();
        let err = db.set_setting("gpu_vendor", "amd").unwrap_err();
        assert!(
            err.contains("no such table: settings"),
            "empty memory DB should reject writes: {err}"
        );
        db.reopen(&dir).unwrap();
        db.set_setting("gpu_vendor", "amd").unwrap();
        assert_eq!(
            db.get_setting("gpu_vendor").unwrap().as_deref(),
            Some("amd")
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
