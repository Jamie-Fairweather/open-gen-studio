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

    /// Background generate / prompt-tool threads die with the process; clear orphans so
    /// Prompt Tools is not blocked forever by a stale `running`/`queued` row.
    pub fn fail_interrupted_jobs_on_startup(&self) -> Result<usize, String> {
        let ts = now_secs();
        let n = self
            .conn
            .execute(
                "UPDATE jobs SET status = 'failed', error = ?1, updated_at = ?2
                 WHERE status IN ('running', 'queued')",
                params!["Interrupted by app restart", ts],
            )
            .map_err(|e| e.to_string())?;
        Ok(n)
    }

    /// Fail generate rows with no live worker (mid-session panic / lost thread).
    pub fn fail_orphaned_generate_jobs(&self) -> Result<Vec<Job>, String> {
        let orphans: Vec<Job> = self
            .list_jobs()?
            .into_iter()
            .filter(|j| j.kind == "generate" && (j.status == "running" || j.status == "queued"))
            .collect();
        let mut updated = Vec::with_capacity(orphans.len());
        for job in orphans {
            updated.push(self.update_job_status(
                &job.id,
                "failed",
                Some("Interrupted (no active worker)"),
            )?);
        }
        Ok(updated)
    }
}
