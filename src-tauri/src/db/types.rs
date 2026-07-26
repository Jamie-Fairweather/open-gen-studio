use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJobRow {
    pub id: String,
    pub job_key: String,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub error: Option<String>,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStepRow {
    pub id: String,
    pub job_id: String,
    pub idx: i64,
    pub step_kind: String,
    pub label: String,
    pub spec_json: String,
    pub status: String,
    pub bytes_done: i64,
    pub bytes_total: Option<i64>,
    pub error: Option<String>,
    pub updated_at: i64,
}
