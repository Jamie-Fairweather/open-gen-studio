use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DownloadSpec {
    #[serde(rename = "blueprint")]
    Blueprint { id: String },
    #[serde(rename = "lora")]
    Lora { id: String, arch: String },
    #[serde(rename = "upscale")]
    Upscale { id: String },
    #[serde(rename = "promptTools")]
    PromptTools { provider: String },
    #[serde(rename = "runtime")]
    Runtime { engine: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureOpts {
    #[serde(default)]
    pub wait: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureResult {
    pub status: String,
    pub job_id: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStepView {
    pub id: String,
    pub idx: i64,
    pub step_kind: String,
    pub label: String,
    pub status: String,
    pub bytes_done: i64,
    pub bytes_total: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJobView {
    pub id: String,
    pub job_key: String,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub steps: Vec<DownloadStepView>,
    pub active_label: Option<String>,
    pub downloaded: i64,
    pub total: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSnapshot {
    pub active: Option<DownloadJobView>,
    pub queued: Vec<DownloadJobView>,
    pub history: Vec<DownloadJobView>,
}
