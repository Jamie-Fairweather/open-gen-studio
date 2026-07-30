use rusqlite::{params, OptionalExtension};

use super::{now_secs, Db, RuntimeInstall};

impl Db {
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
