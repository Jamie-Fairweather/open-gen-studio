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
    /// hold `AppState` until process exit / relaunch.
    pub fn close_disk(&mut self) -> Result<(), String> {
        let _ = self.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        let mem = Connection::open_in_memory().map_err(|e| e.to_string())?;
        self.conn = mem;
        Ok(())
    }
}
