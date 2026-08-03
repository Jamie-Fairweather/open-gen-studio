use rusqlite::{params, OptionalExtension};

use super::{now_secs, Db, GalleryItem};

impl Db {
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

    pub fn list_gallery_by_job(&self, job_id: &str) -> Result<Vec<GalleryItem>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, job_id, path, thumbnail_path, metadata_json, created_at
                 FROM gallery_items WHERE job_id = ?1 ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![job_id], |row| {
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

    /// All gallery rows that still point at a job (for history list join).
    pub fn list_gallery_with_job(&self) -> Result<Vec<GalleryItem>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, job_id, path, thumbnail_path, metadata_json, created_at
                 FROM gallery_items
                 WHERE job_id IS NOT NULL
                 ORDER BY created_at DESC",
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

    pub fn delete_gallery_by_job(&self, job_id: &str) -> Result<Vec<GalleryItem>, String> {
        let items = self.list_gallery_by_job(job_id)?;
        self.conn
            .execute(
                "DELETE FROM gallery_items WHERE job_id = ?1",
                params![job_id],
            )
            .map_err(|e| e.to_string())?;
        Ok(items)
    }

    pub fn clear_gallery_job_link(&self, job_id: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE gallery_items SET job_id = NULL WHERE job_id = ?1",
                params![job_id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_gallery_thumbnail(&self, id: &str, thumbnail_path: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE gallery_items SET thumbnail_path = ?1 WHERE id = ?2",
                params![thumbnail_path, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
