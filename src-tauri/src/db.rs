use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Db {
    conn: Connection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub status: String,
    pub kind: String,
    pub params_json: String,
    pub error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItem {
    pub id: String,
    pub job_id: Option<String>,
    pub path: String,
    pub thumbnail_path: Option<String>,
    pub metadata_json: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstall {
    pub id: String,
    pub engine: String,
    pub version: String,
    pub install_path: String,
    pub port: Option<i64>,
    pub status: String,
    pub error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
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
        let path = app_data_dir.join("open-gen-ai.db");
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), String> {
        let version: i32 = self
            .conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|e| e.to_string())?;

        if version < 1 {
            self.conn
                .execute_batch(
                    r#"
                    CREATE TABLE settings (
                      key TEXT PRIMARY KEY NOT NULL,
                      value TEXT NOT NULL
                    );

                    CREATE TABLE jobs (
                      id TEXT PRIMARY KEY NOT NULL,
                      status TEXT NOT NULL,
                      kind TEXT NOT NULL DEFAULT 'generate',
                      params_json TEXT NOT NULL DEFAULT '{}',
                      error TEXT,
                      created_at INTEGER NOT NULL,
                      updated_at INTEGER NOT NULL
                    );

                    CREATE TABLE gallery_items (
                      id TEXT PRIMARY KEY NOT NULL,
                      job_id TEXT,
                      path TEXT NOT NULL,
                      thumbnail_path TEXT,
                      metadata_json TEXT NOT NULL DEFAULT '{}',
                      created_at INTEGER NOT NULL,
                      FOREIGN KEY (job_id) REFERENCES jobs(id)
                    );

                    INSERT INTO settings (key, value) VALUES
                      ('catalog_repo', 'https://github.com/open-gen-ai/blueprints'),
                      ('gpu_preference', 'auto');
                    "#,
                )
                .map_err(|e| e.to_string())?;
            self.conn
                .pragma_update(None, "user_version", 1)
                .map_err(|e| e.to_string())?;
        }

        let version: i32 = self
            .conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|e| e.to_string())?;

        if version < 2 {
            self.conn
                .execute_batch(
                    r#"
                    CREATE TABLE runtime_installs (
                      id TEXT PRIMARY KEY NOT NULL,
                      engine TEXT NOT NULL,
                      version TEXT NOT NULL,
                      install_path TEXT NOT NULL,
                      port INTEGER,
                      status TEXT NOT NULL,
                      error TEXT,
                      created_at INTEGER NOT NULL,
                      updated_at INTEGER NOT NULL
                    );
                    "#,
                )
                .map_err(|e| e.to_string())?;
            self.conn
                .pragma_update(None, "user_version", 2)
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn list_settings(&self) -> Result<Vec<(String, String)>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT key, value FROM settings ORDER BY key")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        self.conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_jobs(&self) -> Result<Vec<Job>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, status, kind, params_json, error, created_at, updated_at
                 FROM jobs ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(Job {
                    id: row.get(0)?,
                    status: row.get(1)?,
                    kind: row.get(2)?,
                    params_json: row.get(3)?,
                    error: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn create_job(&self, kind: &str, params_json: &str) -> Result<Job, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let ts = now_secs();
        self.conn
            .execute(
                "INSERT INTO jobs (id, status, kind, params_json, created_at, updated_at)
                 VALUES (?1, 'queued', ?2, ?3, ?4, ?4)",
                params![id, kind, params_json, ts],
            )
            .map_err(|e| e.to_string())?;
        Ok(Job {
            id,
            status: "queued".into(),
            kind: kind.into(),
            params_json: params_json.into(),
            error: None,
            created_at: ts,
            updated_at: ts,
        })
    }

    pub fn update_job_status(
        &self,
        id: &str,
        status: &str,
        error: Option<&str>,
    ) -> Result<Job, String> {
        let ts = now_secs();
        self.conn
            .execute(
                "UPDATE jobs SET status = ?1, error = ?2, updated_at = ?3 WHERE id = ?4",
                params![status, error, ts, id],
            )
            .map_err(|e| e.to_string())?;
        self.conn
            .query_row(
                "SELECT id, status, kind, params_json, error, created_at, updated_at
                 FROM jobs WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Job {
                        id: row.get(0)?,
                        status: row.get(1)?,
                        kind: row.get(2)?,
                        params_json: row.get(3)?,
                        error: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .map_err(|e| e.to_string())
    }

    pub fn list_gallery(&self) -> Result<Vec<GalleryItem>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, job_id, path, thumbnail_path, metadata_json, created_at
                 FROM gallery_items ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(GalleryItem {
                    id: row.get(0)?,
                    job_id: row.get(1)?,
                    path: row.get(2)?,
                    thumbnail_path: row.get(3)?,
                    metadata_json: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn add_gallery_item(
        &self,
        job_id: Option<&str>,
        path: &str,
        thumbnail_path: Option<&str>,
        metadata_json: &str,
    ) -> Result<GalleryItem, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let ts = now_secs();
        self.conn
            .execute(
                "INSERT INTO gallery_items (id, job_id, path, thumbnail_path, metadata_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, job_id, path, thumbnail_path, metadata_json, ts],
            )
            .map_err(|e| e.to_string())?;
        Ok(GalleryItem {
            id,
            job_id: job_id.map(str::to_string),
            path: path.into(),
            thumbnail_path: thumbnail_path.map(str::to_string),
            metadata_json: metadata_json.into(),
            created_at: ts,
        })
    }

    pub fn get_gallery_item(&self, id: &str) -> Result<Option<GalleryItem>, String> {
        self.conn
            .query_row(
                "SELECT id, job_id, path, thumbnail_path, metadata_json, created_at
                 FROM gallery_items WHERE id = ?1",
                params![id],
                |row| {
                    Ok(GalleryItem {
                        id: row.get(0)?,
                        job_id: row.get(1)?,
                        path: row.get(2)?,
                        thumbnail_path: row.get(3)?,
                        metadata_json: row.get(4)?,
                        created_at: row.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn delete_gallery_item(&self, id: &str) -> Result<Option<GalleryItem>, String> {
        let item = self.get_gallery_item(id)?;
        if item.is_some() {
            self.conn
                .execute("DELETE FROM gallery_items WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
        Ok(item)
    }

    pub fn list_runtimes(&self) -> Result<Vec<RuntimeInstall>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, engine, version, install_path, port, status, error, created_at, updated_at
                 FROM runtime_installs ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(RuntimeInstall {
                    id: row.get(0)?,
                    engine: row.get(1)?,
                    version: row.get(2)?,
                    install_path: row.get(3)?,
                    port: row.get(4)?,
                    status: row.get(5)?,
                    error: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_runtime_by_engine(&self, engine: &str) -> Result<Option<RuntimeInstall>, String> {
        self.conn
            .query_row(
                "SELECT id, engine, version, install_path, port, status, error, created_at, updated_at
                 FROM runtime_installs WHERE engine = ?1 ORDER BY updated_at DESC LIMIT 1",
                params![engine],
                |row| {
                    Ok(RuntimeInstall {
                        id: row.get(0)?,
                        engine: row.get(1)?,
                        version: row.get(2)?,
                        install_path: row.get(3)?,
                        port: row.get(4)?,
                        status: row.get(5)?,
                        error: row.get(6)?,
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn upsert_runtime(&self, runtime: &RuntimeInstall) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO runtime_installs
                   (id, engine, version, install_path, port, status, error, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                   version = excluded.version,
                   install_path = excluded.install_path,
                   port = excluded.port,
                   status = excluded.status,
                   error = excluded.error,
                   updated_at = excluded.updated_at",
                params![
                    runtime.id,
                    runtime.engine,
                    runtime.version,
                    runtime.install_path,
                    runtime.port,
                    runtime.status,
                    runtime.error,
                    runtime.created_at,
                    runtime.updated_at,
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_runtime_status(
        &self,
        id: &str,
        status: &str,
        port: Option<i64>,
        error: Option<&str>,
    ) -> Result<RuntimeInstall, String> {
        let ts = now_secs();
        self.conn
            .execute(
                "UPDATE runtime_installs
                 SET status = ?1, port = COALESCE(?2, port), error = ?3, updated_at = ?4
                 WHERE id = ?5",
                params![status, port, error, ts, id],
            )
            .map_err(|e| e.to_string())?;
        self.conn
            .query_row(
                "SELECT id, engine, version, install_path, port, status, error, created_at, updated_at
                 FROM runtime_installs WHERE id = ?1",
                params![id],
                |row| {
                    Ok(RuntimeInstall {
                        id: row.get(0)?,
                        engine: row.get(1)?,
                        version: row.get(2)?,
                        install_path: row.get(3)?,
                        port: row.get(4)?,
                        status: row.get(5)?,
                        error: row.get(6)?,
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                    })
                },
            )
            .map_err(|e| e.to_string())
    }
}
