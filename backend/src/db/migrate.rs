use super::Db;

impl Db {
    pub(super) fn migrate(&self) -> Result<(), String> {
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
                      ('catalog_repo', 'https://github.com/Jamie-Fairweather/open-gen-studio'),
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

        let version: i32 = self
            .conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|e| e.to_string())?;

        if version < 3 {
            self.conn
                .execute_batch(
                    r#"
                    CREATE TABLE download_jobs (
                      id TEXT PRIMARY KEY NOT NULL,
                      job_key TEXT NOT NULL UNIQUE,
                      title TEXT NOT NULL,
                      kind TEXT NOT NULL,
                      status TEXT NOT NULL,
                      error TEXT,
                      sort_order INTEGER NOT NULL DEFAULT 0,
                      created_at INTEGER NOT NULL,
                      updated_at INTEGER NOT NULL,
                      started_at INTEGER,
                      finished_at INTEGER
                    );

                    CREATE TABLE download_steps (
                      id TEXT PRIMARY KEY NOT NULL,
                      job_id TEXT NOT NULL,
                      idx INTEGER NOT NULL,
                      step_kind TEXT NOT NULL,
                      label TEXT NOT NULL,
                      spec_json TEXT NOT NULL DEFAULT '{}',
                      status TEXT NOT NULL,
                      bytes_done INTEGER NOT NULL DEFAULT 0,
                      bytes_total INTEGER,
                      error TEXT,
                      updated_at INTEGER NOT NULL,
                      FOREIGN KEY (job_id) REFERENCES download_jobs(id) ON DELETE CASCADE
                    );

                    CREATE INDEX download_jobs_status_idx ON download_jobs(status, sort_order);
                    CREATE INDEX download_steps_job_idx ON download_steps(job_id, idx);
                    "#,
                )
                .map_err(|e| e.to_string())?;
            self.conn
                .pragma_update(None, "user_version", 3)
                .map_err(|e| e.to_string())?;
        }

        let version: i32 = self
            .conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|e| e.to_string())?;

        if version < 4 {
            self.conn
                .execute_batch(
                    r#"
                    ALTER TABLE jobs ADD COLUMN queue_order INTEGER NOT NULL DEFAULT 0;
                    "#,
                )
                .map_err(|e| e.to_string())?;
            self.conn
                .pragma_update(None, "user_version", 4)
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }
}
