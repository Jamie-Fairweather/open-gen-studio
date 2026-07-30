use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

pub fn local_file_len(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|m| m.len())
}

/// True when a local model file looks like real weights (not an HTML error page).
/// Size-only skip is unsafe: a resumed HF HTML gate + Range can match remote length.
/// Note: truncated safetensors still pass - use [`local_file_complete`] before skipping downloads.
pub fn local_file_usable(path: &Path) -> bool {
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    let mut head = [0u8; 16];
    let Ok(n) = file.read(&mut head) else {
        return false;
    };
    if n == 0 {
        return false;
    }
    if looks_like_html(&head[..n]) {
        return false;
    }
    let is_st = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("safetensors"));
    if !is_st {
        return true;
    }
    if n < 8 {
        return false;
    }
    let header_len = u64::from_le_bytes(head[0..8].try_into().unwrap());
    // Real safetensors JSON headers are small; HTML-as-u64 is huge garbage.
    if !(2..=16 * 1024 * 1024).contains(&header_len) {
        return false;
    }
    // JSON starts at byte 8 - already in `head` when we read ≥9 bytes.
    if n > 8 {
        return head[8] == b'{';
    }
    let mut first = [0u8; 1];
    matches!(file.read_exact(&mut first), Ok(())) && first[0] == b'{'
}

/// Usable **and** fully present. Truncated safetensors keep a valid header but miss tensor bytes.
pub fn local_file_complete(path: &Path) -> bool {
    if !local_file_usable(path) {
        return false;
    }
    let is_st = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("safetensors"));
    if !is_st {
        return true;
    }
    safetensors_payload_complete(path)
}

/// Verify file length covers every tensor listed in the safetensors JSON header.
pub(crate) fn safetensors_payload_complete(path: &Path) -> bool {
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    let Ok(meta) = file.metadata() else {
        return false;
    };
    let file_len = meta.len();
    let mut len_buf = [0u8; 8];
    if file.read_exact(&mut len_buf).is_err() {
        return false;
    }
    let header_len = u64::from_le_bytes(len_buf);
    if !(2..=16 * 1024 * 1024).contains(&header_len) {
        return false;
    }
    if file_len < 8 + header_len {
        return false;
    }
    let mut header = vec![0u8; header_len as usize];
    if file.read_exact(&mut header).is_err() {
        return false;
    }
    let Ok(serde_json::Value::Object(map)) = serde_json::from_slice::<serde_json::Value>(&header)
    else {
        return false;
    };
    let mut max_end = 0u64;
    for (key, val) in &map {
        if key == "__metadata__" {
            continue;
        }
        let Some(offsets) = val.get("data_offsets").and_then(|o| o.as_array()) else {
            continue;
        };
        if offsets.len() != 2 {
            return false;
        }
        let Some(end) = offsets[1].as_u64() else {
            return false;
        };
        max_end = max_end.max(end);
    }
    file_len >= 8 + header_len + max_end
}

pub(crate) fn looks_like_html(bytes: &[u8]) -> bool {
    let lower: Vec<u8> = bytes
        .iter()
        .map(|b| b.to_ascii_lowercase())
        .take(64)
        .collect();
    lower.starts_with(b"<!doctype")
        || lower.starts_with(b"<html")
        || lower.windows(6).any(|w| w == b"<html ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn rejects_html_prefix_as_unusable() {
        let dir = std::env::temp_dir().join(format!("oga-dl-html-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("fake.safetensors");
        let mut f = File::create(&path).unwrap();
        f.write_all(b"<!doctype html><html><body>login</body></html>")
            .unwrap();
        drop(f);
        assert!(!local_file_usable(&path));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn accepts_minimal_safetensors_header() {
        let dir = std::env::temp_dir().join(format!("oga-dl-ok-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("ok.safetensors");
        let header = br#"{"a":{"dtype":"F32","shape":[1],"data_offsets":[0,4]}}"#;
        let mut f = File::create(&path).unwrap();
        f.write_all(&(header.len() as u64).to_le_bytes()).unwrap();
        f.write_all(header).unwrap();
        f.write_all(&[0u8; 4]).unwrap();
        drop(f);
        assert!(local_file_usable(&path));
        assert!(local_file_complete(&path));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_truncated_safetensors_payload() {
        let dir = std::env::temp_dir().join(format!("oga-dl-trunc-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("trunc.safetensors");
        let header = br#"{"a":{"dtype":"F32","shape":[1],"data_offsets":[0,4]}}"#;
        let mut f = File::create(&path).unwrap();
        f.write_all(&(header.len() as u64).to_le_bytes()).unwrap();
        f.write_all(header).unwrap();
        // Missing the 4 payload bytes.
        drop(f);
        assert!(local_file_usable(&path));
        assert!(!local_file_complete(&path));
        let _ = fs::remove_dir_all(&dir);
    }
}
