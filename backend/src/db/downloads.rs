use rusqlite::{params, OptionalExtension};

use super::{now_secs, Db, DownloadJobRow, DownloadStepRow};

impl Db {
    fn map_download_job(row: &rusqlite::Row<'_>) -> rusqlite::Result<DownloadJobRow> {
        Ok(DownloadJobRow {
            id: row.get(0)?,
            job_key: row.get(1)?,
            title: row.get(2)?,
            kind: row.get(3)?,
            status: row.get(4)?,
            error: row.get(5)?,
            sort_order: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            started_at: row.get(9)?,
            finished_at: row.get(10)?,
        })
    }

    fn map_download_step(row: &rusqlite::Row<'_>) -> rusqlite::Result<DownloadStepRow> {
        Ok(DownloadStepRow {
            id: row.get(0)?,
            job_id: row.get(1)?,
            idx: row.get(2)?,
            step_kind: row.get(3)?,
            label: row.get(4)?,
            spec_json: row.get(5)?,
            status: row.get(6)?,
            bytes_done: row.get(7)?,
            bytes_total: row.get(8)?,
            error: row.get(9)?,
            updated_at: row.get(10)?,
        })
    }

    pub fn get_download_job_by_key(&self, job_key: &str) -> Result<Option<DownloadJobRow>, String> {
        self.conn
            .query_row(
                "SELECT id, job_key, title, kind, status, error, sort_order,
                        created_at, updated_at, started_at, finished_at
                 FROM download_jobs WHERE job_key = ?1",
                params![job_key],
                Self::map_download_job,
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn get_download_job(&self, id: &str) -> Result<Option<DownloadJobRow>, String> {
        self.conn
            .query_row(
                "SELECT id, job_key, title, kind, status, error, sort_order,
                        created_at, updated_at, started_at, finished_at
                 FROM download_jobs WHERE id = ?1",
                params![id],
                Self::map_download_job,
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn list_download_jobs_by_status(
        &self,
        statuses: &[&str],
    ) -> Result<Vec<DownloadJobRow>, String> {
        if statuses.is_empty() {
            return Ok(vec![]);
        }
        let placeholders = statuses
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT id, job_key, title, kind, status, error, sort_order,
                    created_at, updated_at, started_at, finished_at
             FROM download_jobs WHERE status IN ({placeholders})
             ORDER BY sort_order ASC, created_at ASC"
        );
        let mut stmt = self.conn.prepare(&sql).map_err(|e| e.to_string())?;
        let params = statuses
            .iter()
            .map(|s| s as &dyn rusqlite::ToSql)
            .collect::<Vec<_>>();
        let rows = stmt
            .query_map(params.as_slice(), Self::map_download_job)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn list_download_history(&self, limit: i64) -> Result<Vec<DownloadJobRow>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, job_key, title, kind, status, error, sort_order,
                        created_at, updated_at, started_at, finished_at
                 FROM download_jobs
                 WHERE status IN ('done', 'error', 'cancelled')
                 ORDER BY COALESCE(finished_at, updated_at) DESC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit], Self::map_download_job)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn next_download_sort_order(&self) -> Result<i64, String> {
        let max: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), 0) FROM download_jobs
                 WHERE status IN ('queued', 'running', 'paused')",
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(max + 1)
    }

    pub fn insert_download_job(&self, job: &DownloadJobRow) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO download_jobs
                 (id, job_key, title, kind, status, error, sort_order,
                  created_at, updated_at, started_at, finished_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    job.id,
                    job.job_key,
                    job.title,
                    job.kind,
                    job.status,
                    job.error,
                    job.sort_order,
                    job.created_at,
                    job.updated_at,
                    job.started_at,
                    job.finished_at
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn insert_download_step(&self, step: &DownloadStepRow) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO download_steps
                 (id, job_id, idx, step_kind, label, spec_json, status,
                  bytes_done, bytes_total, error, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    step.id,
                    step.job_id,
                    step.idx,
                    step.step_kind,
                    step.label,
                    step.spec_json,
                    step.status,
                    step.bytes_done,
                    step.bytes_total,
                    step.error,
                    step.updated_at
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_download_steps(&self, job_id: &str) -> Result<Vec<DownloadStepRow>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, job_id, idx, step_kind, label, spec_json, status,
                        bytes_done, bytes_total, error, updated_at
                 FROM download_steps WHERE job_id = ?1 ORDER BY idx ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![job_id], Self::map_download_step)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn update_download_job_status(
        &self,
        id: &str,
        status: &str,
        error: Option<&str>,
    ) -> Result<(), String> {
        let ts = now_secs();
        let finished = matches!(status, "done" | "error" | "cancelled");
        let started = status == "running";
        self.conn
            .execute(
                "UPDATE download_jobs SET
                   status = ?1,
                   error = ?2,
                   updated_at = ?3,
                   started_at = CASE WHEN ?4 THEN COALESCE(started_at, ?3) ELSE started_at END,
                   finished_at = CASE WHEN ?5 THEN ?3 ELSE finished_at END
                 WHERE id = ?6",
                params![status, error, ts, started, finished, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_download_step_status(
        &self,
        id: &str,
        status: &str,
        error: Option<&str>,
        bytes_done: Option<i64>,
        bytes_total: Option<i64>,
    ) -> Result<(), String> {
        let ts = now_secs();
        self.conn
            .execute(
                "UPDATE download_steps SET
                   status = ?1,
                   error = ?2,
                   bytes_done = COALESCE(?3, bytes_done),
                   bytes_total = COALESCE(?4, bytes_total),
                   updated_at = ?5
                 WHERE id = ?6",
                params![status, error, bytes_done, bytes_total, ts, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn reset_running_downloads_on_startup(&self) -> Result<(), String> {
        let ts = now_secs();
        self.conn
            .execute(
                "UPDATE download_jobs SET status = 'queued', updated_at = ?1
                 WHERE status = 'running'",
                params![ts],
            )
            .map_err(|e| e.to_string())?;
        self.conn
            .execute(
                "UPDATE download_steps SET status = 'queued', updated_at = ?1
                 WHERE status = 'running'",
                params![ts],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn prune_download_history(&self, keep: i64) -> Result<(), String> {
        self.conn
            .execute(
                "DELETE FROM download_jobs WHERE id IN (
                   SELECT id FROM download_jobs
                   WHERE status IN ('done', 'error', 'cancelled')
                   ORDER BY COALESCE(finished_at, updated_at) DESC
                   LIMIT -1 OFFSET ?1
                 )",
                params![keep],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_download_job(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM download_steps WHERE job_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM download_jobs WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
