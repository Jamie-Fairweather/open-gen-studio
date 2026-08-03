use rusqlite::params;

use super::{now_secs, Db, Job};

impl Db {
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

    /// Active lane jobs for startup rehydrate (queued / running / paused).
    pub fn list_active_jobs(&self) -> Result<Vec<Job>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, status, kind, params_json, error, created_at, updated_at
                 FROM jobs
                 WHERE status IN ('queued', 'running', 'paused')
                 ORDER BY queue_order ASC, created_at ASC",
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

    pub fn list_history_jobs(&self) -> Result<Vec<Job>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, status, kind, params_json, error, created_at, updated_at
                 FROM jobs
                 WHERE status IN ('completed', 'failed', 'cancelled')
                 ORDER BY updated_at DESC, created_at DESC",
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

    pub fn get_job(&self, id: &str) -> Result<Option<Job>, String> {
        use rusqlite::OptionalExtension;
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
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn create_job(&self, kind: &str, params_json: &str) -> Result<Job, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let ts = now_secs();
        let queue_order: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(queue_order), 0) + 1 FROM jobs WHERE status IN ('queued', 'running', 'paused')",
                [],
                |row| row.get(0),
            )
            .unwrap_or(ts);
        self.conn
            .execute(
                "INSERT INTO jobs (id, status, kind, params_json, created_at, updated_at, queue_order)
                 VALUES (?1, 'queued', ?2, ?3, ?4, ?4, ?5)",
                params![id, kind, params_json, ts, queue_order],
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
        self.get_job(id)?
            .ok_or_else(|| format!("job not found: {id}"))
    }

    pub fn update_job_params(&self, id: &str, params_json: &str) -> Result<Job, String> {
        let ts = now_secs();
        self.conn
            .execute(
                "UPDATE jobs SET params_json = ?1, updated_at = ?2 WHERE id = ?3",
                params![params_json, ts, id],
            )
            .map_err(|e| e.to_string())?;
        self.get_job(id)?
            .ok_or_else(|| format!("job not found: {id}"))
    }

    pub fn set_queue_orders(&self, ordered_ids: &[String]) -> Result<(), String> {
        let ts = now_secs();
        for (i, id) in ordered_ids.iter().enumerate() {
            self.conn
                .execute(
                    "UPDATE jobs SET queue_order = ?1, updated_at = ?2 WHERE id = ?3",
                    params![i as i64, ts, id],
                )
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn delete_job_by_id_if_history(&self, id: &str) -> Result<bool, String> {
        let n = self
            .conn
            .execute(
                "DELETE FROM jobs WHERE id = ?1 AND status IN ('completed', 'failed', 'cancelled')",
                params![id],
            )
            .map_err(|e| e.to_string())?;
        Ok(n > 0)
    }
}
