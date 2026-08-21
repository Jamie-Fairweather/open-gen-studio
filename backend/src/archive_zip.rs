//! Zip download helpers (GitHub codeload archives, Manager wheels).

use crate::download;
use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use zip::ZipArchive;

/// Parse `https://github.com/{owner}/{repo}.git` (or without `.git`) → (owner, repo).
pub fn github_owner_repo(repo_url: &str) -> Result<(String, String), String> {
    let url = repo_url
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git");
    let rest = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
        .or_else(|| url.strip_prefix("git@github.com:"))
        .ok_or_else(|| format!("not a GitHub repo URL: {repo_url}"))?;
    let mut parts = rest.split('/');
    let owner = parts
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("missing GitHub owner in {repo_url}"))?;
    let repo = parts
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("missing GitHub repo in {repo_url}"))?;
    if parts.next().is_some() {
        return Err(format!("unexpected GitHub URL shape: {repo_url}"));
    }
    Ok((owner.to_string(), repo.to_string()))
}

/// Codeload zip for an exact commit SHA.
pub fn github_commit_zip_url(repo_url: &str, commit: &str) -> Result<String, String> {
    let (owner, repo) = github_owner_repo(repo_url)?;
    Ok(format!(
        "https://codeload.github.com/{owner}/{repo}/zip/{commit}"
    ))
}

/// Extract a zip file into `dest_dir` (created if needed).
pub fn extract_zip(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
    let file = File::open(zip_path).map_err(|e| format!("open zip {}: {e}", zip_path.display()))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("read zip {}: {e}", zip_path.display()))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zip entry {i}: {e}"))?;
        let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let out = dest_dir.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut outfile = File::create(&out).map_err(|e| e.to_string())?;
        io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// First top-level directory inside `dir` (GitHub zip root).
pub fn single_top_level_dir(dir: &Path) -> Result<PathBuf, String> {
    let mut dirs = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            dirs.push(path);
        }
    }
    match dirs.len() {
        1 => Ok(dirs.remove(0)),
        0 => Err(format!("zip extract empty: {}", dir.display())),
        _ => Err(format!(
            "zip extract has multiple roots under {}",
            dir.display()
        )),
    }
}

/// Download a zip URL and extract into `extract_to`.
pub fn download_and_extract_zip(
    app: &AppHandle,
    url: &str,
    zip_dest: &Path,
    extract_to: &Path,
) -> Result<(), String> {
    if let Some(parent) = zip_dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if extract_to.exists() {
        fs::remove_dir_all(extract_to).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(extract_to).map_err(|e| e.to_string())?;
    download::download_file(app, url, zip_dest, None)?;
    extract_zip(zip_dest, extract_to)?;
    let _ = fs::remove_file(zip_dest);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_github_https_and_ssh() {
        assert_eq!(
            github_owner_repo("https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git").unwrap(),
            ("ssitu".into(), "ComfyUI_UltimateSDUpscale".into())
        );
        assert_eq!(
            github_owner_repo("https://github.com/kijai/ComfyUI-SUPIR").unwrap(),
            ("kijai".into(), "ComfyUI-SUPIR".into())
        );
        assert_eq!(
            github_owner_repo("git@github.com:1038lab/ComfyUI-QwenVL.git").unwrap(),
            ("1038lab".into(), "ComfyUI-QwenVL".into())
        );
    }

    #[test]
    fn codeload_url() {
        let url = github_commit_zip_url(
            "https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git",
            "a5547db9e1d07d3318bb21e9e9c474f4c1e9c8df",
        )
        .unwrap();
        assert_eq!(
            url,
            "https://codeload.github.com/ssitu/ComfyUI_UltimateSDUpscale/zip/a5547db9e1d07d3318bb21e9e9c474f4c1e9c8df"
        );
    }
}
