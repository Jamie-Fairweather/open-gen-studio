use crate::pins::{COMFY_PINNED_VERSION, COMFY_PIN_MARKER};
use crate::process_cmd;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::env;
use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const ENGINE: &str = "comfyui";
pub const DEFAULT_PORT: u16 = 8188;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProgress {
    pub engine: String,
    pub stage: String,
    pub message: String,
}

pub struct ProcessState {
    pub child: Option<Child>,
    pub runtime_id: Option<String>,
    pub port: Option<u16>,
    /// Last ComfyUI stdout/stderr log (kept after crash for error messages).
    pub log_path: Option<PathBuf>,
}

impl Default for ProcessState {
    fn default() -> Self {
        Self {
            child: None,
            runtime_id: None,
            port: None,
            log_path: None,
        }
    }
}

pub(crate) fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub(crate) fn emit_progress(app: &AppHandle, stage: &str, message: &str) {
    let _ = app.emit(
        "runtimes://progress",
        RuntimeProgress {
            engine: ENGINE.into(),
            stage: stage.into(),
            message: message.into(),
        },
    );
}

/// Pin marker body: `{version}|{portable_kind}` e.g. `v0.28.0|nvidia_cu126`.
pub fn pin_marker_value(portable_kind: &str) -> String {
    format!("{COMFY_PINNED_VERSION}|{portable_kind}")
}

pub fn read_pin_marker(root: &Path) -> Option<String> {
    fs::read_to_string(root.join(COMFY_PIN_MARKER))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(crate) fn write_pin_marker(root: &Path, portable_kind: &str) -> Result<(), String> {
    fs::write(root.join(COMFY_PIN_MARKER), pin_marker_value(portable_kind))
        .map_err(|e| e.to_string())
}

/// True when the extract looks ready and matches the app's Comfy pin + portable kind.
pub fn portable_pin_matches(root: &Path, portable_kind: &str) -> bool {
    portable_ready(root)
        && read_pin_marker(root).as_deref() == Some(pin_marker_value(portable_kind).as_str())
}

pub fn runtimes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::app_paths::app_data_dir(app)?
        .join("runtimes")
        .join(ENGINE))
}

pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::app_paths::app_data_dir(app)?.join("models"))
}

pub(crate) fn looks_like_portable_root(path: &Path) -> bool {
    path.join("python_embeded").is_dir() && path.join("ComfyUI").is_dir()
}

pub(crate) fn portable_ready(path: &Path) -> bool {
    portable_python_exe(path).is_ok() && path.join("ComfyUI").join("main.py").is_file()
}

/// `python_embeded/python.exe` after verifying the **exact** `python3XX.dll` it imports.
/// Incomplete 7z extracts often leave the `.exe` (sorted earlier) without that DLL.
pub fn portable_python_exe(root: &Path) -> Result<PathBuf, String> {
    let embed = root.join("python_embeded");
    let python = embed.join("python.exe");
    if !python.is_file() {
        return Err("ComfyUI portable python.exe missing".into());
    }
    let exe_len = fs::metadata(&python).map(|m| m.len()).unwrap_or(0);
    if exe_len < 10_000 {
        return Err(format!(
            "ComfyUI portable python.exe looks invalid ({exe_len} bytes) at {}",
            python.display()
        ));
    }
    let required = required_python_dll_name(&python).ok_or_else(|| {
        format!(
            "could not determine python3XX.dll required by {}",
            python.display()
        )
    })?;
    let dll = embed.join(&required);
    if !dll_usable(&dll, 1_000_000) {
        return Err(format!(
            "ComfyUI portable is missing {required} next to {} \
(incomplete extract or antivirus quarantine). Found: {}. Reinstall ComfyUI from Settings.",
            embed.display(),
            list_python_dlls(&embed)
        ));
    }
    // Ensure the loader can open the file (not just that the directory entry exists).
    if fs::File::open(&dll).is_err() {
        return Err(format!(
            "ComfyUI portable {required} exists but cannot be opened (locked or quarantined) in {}",
            embed.display()
        ));
    }
    // Canonicalize so CreateProcess uses the real path under MSIX path virtualization.
    Ok(fs::canonicalize(&python).unwrap_or(python))
}

fn list_python_dlls(embed: &Path) -> String {
    let Ok(entries) = fs::read_dir(embed) else {
        return "(unreadable)".into();
    };
    let mut parts = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let lower = name.to_ascii_lowercase();
        if !(lower.starts_with("python") && lower.ends_with(".dll")) {
            continue;
        }
        let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
        parts.push(format!("{name} ({len} bytes)"));
    }
    if parts.is_empty() {
        "(none)".into()
    } else {
        parts.join(", ")
    }
}

/// Read `python.exe` bytes for an imported `python3XX.dll` name (PE import string).
fn required_python_dll_name(python_exe: &Path) -> Option<String> {
    const CANDIDATES: &[&str] = &[
        "python313.dll",
        "python312.dll",
        "python311.dll",
        "python310.dll",
        "python39.dll",
    ];
    let bytes = fs::read(python_exe).ok()?;
    for name in CANDIDATES {
        if bytes_contains_ignore_ascii_case(&bytes, name.as_bytes()) {
            return Some((*name).to_string());
        }
    }
    None
}

fn bytes_contains_ignore_ascii_case(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() || haystack.len() < needle.len() {
        return false;
    }
    haystack.windows(needle.len()).any(|window| {
        window
            .iter()
            .zip(needle.iter())
            .all(|(a, b)| a.to_ascii_lowercase() == b.to_ascii_lowercase())
    })
}

fn dll_usable(path: &Path, min_bytes: u64) -> bool {
    fs::metadata(path)
        .map(|m| m.is_file() && m.len() >= min_bytes)
        .unwrap_or(false)
}

/// Copy a requirements file into `python_embeded` so unpackaged `pip` can open it.
///
/// Under MSIX, the host may see files via AppData redirection while child
/// `python.exe` opens the literal Roaming path and gets ENOENT.
pub fn stage_requirements_for_pip(root: &Path, reqs: &Path) -> Result<PathBuf, String> {
    if !reqs.is_file() {
        return Err(format!("requirements file missing: {}", reqs.display()));
    }
    let root = process_portable_root(root)?;
    let embed = root.join("python_embeded");
    if !embed.is_dir() {
        return Err("python_embeded missing - cannot stage requirements".into());
    }
    let staged = embed.join(".oga_staged_requirements.txt");
    match fs::copy(reqs, &staged) {
        Ok(_) => {}
        Err(_) => {
            let bytes =
                fs::read(reqs).map_err(|e| format!("failed to read {}: {e}", reqs.display()))?;
            fs::write(&staged, bytes)
                .map_err(|e| format!("failed to stage requirements into python_embeded: {e}"))?;
        }
    }
    // Prefer the short (junction) path string for pip -r; do not expand junctions.
    Ok(staged)
}

/// True when pip writes under `site-packages` would exceed classic Windows MAX_PATH (260).
/// Common under MSIX (`Packages\…\LocalCache\Roaming\…`).
pub fn path_too_long_for_pip(root: &Path) -> bool {
    let probe = root
        .join("python_embeded")
        .join("Lib")
        .join("site-packages")
        .join("antlr4_python3_runtime-4.9.3.dist-info")
        .join("INSTALLERxxxxxxxx.tmp");
    probe.to_string_lossy().len() >= 260
}

fn paths_same_target(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => false,
    }
}

/// Short on-disk portable root for MSIX (`%USERPROFILE%\.ogs\cui`).
///
/// Junctions / subst are not enough: Python and pip resolve reparse points back to
/// the long Packages path and still hit MAX_PATH. The tree must actually live here.
fn short_portable_home() -> Result<PathBuf, String> {
    let home = env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .ok_or_else(|| "USERPROFILE not set - cannot create short runtime path".to_string())?;
    Ok(home.join(".ogs").join("cui"))
}

/// When the portable root is too deep for pip, relocate it to a real short directory
/// and leave a junction at the old path so existing install_path lookups keep working.
pub fn process_portable_root(root: &Path) -> Result<PathBuf, String> {
    let real = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    if !path_too_long_for_pip(&real) {
        return Ok(real);
    }

    #[cfg(windows)]
    {
        relocate_portable_to_short_path(&real)
    }
    #[cfg(not(windows))]
    {
        Ok(real)
    }
}

#[cfg(windows)]
fn relocate_portable_to_short_path(long_root: &Path) -> Result<PathBuf, String> {
    let dest = short_portable_home()?;
    if paths_same_target(long_root, &dest) {
        return Ok(fs::canonicalize(&dest).unwrap_or(dest));
    }

    // Already relocated on a prior run — prefer the short tree.
    if looks_like_portable_root(&dest) {
        if path_too_long_for_pip(&dest) {
            return Err(format!(
                "short runtime path is still too long for pip: {}",
                dest.display()
            ));
        }
        // Ensure the old location (if it still exists as a real dir) is a junction.
        let _ = ensure_junction_at(long_root, &dest);
        return Ok(fs::canonicalize(&dest).unwrap_or(dest));
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }
    if dest.exists() {
        fs::remove_dir_all(&dest)
            .map_err(|e| format!("failed to clear {}: {e}", dest.display()))?;
    }

    // Drop any python.exe locks before moving the tree.
    crate::comfy::process::kill_portable_python(long_root);

    // Move the ~2GB portable tree out of Packages\… into a short profile path.
    match fs::rename(long_root, &dest) {
        Ok(()) => {}
        Err(rename_err) => {
            copy_dir_recursive(long_root, &dest).map_err(|e| {
                format!(
                    "failed to relocate ComfyUI portable to {}: rename ({rename_err}); copy ({e})",
                    dest.display()
                )
            })?;
            fs::remove_dir_all(long_root).map_err(|e| {
                format!(
                    "relocated portable to {} but failed to remove old tree {}: {e}",
                    dest.display(),
                    long_root.display()
                )
            })?;
        }
    }

    ensure_junction_at(long_root, &dest)?;

    let short = fs::canonicalize(&dest).unwrap_or(dest);
    if path_too_long_for_pip(&short) {
        return Err(format!(
            "Windows path is still too long for pip after relocate to {}. \
             Choose a shorter data folder in Settings.",
            short.display()
        ));
    }
    Ok(short)
}

#[cfg(windows)]
fn ensure_junction_at(link: &Path, target: &Path) -> Result<(), String> {
    if paths_same_target(link, target) {
        return Ok(());
    }
    if link.exists() || fs::symlink_metadata(link).is_ok() {
        let _ = fs::remove_dir(link);
        let _ = fs::remove_file(link);
        if link.exists() {
            fs::remove_dir_all(link)
                .map_err(|e| format!("failed to replace {} with junction: {e}", link.display()))?;
        }
    }
    if let Some(parent) = link.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let link_s = link.to_string_lossy();
    let target_s = target.to_string_lossy();
    let output = process_cmd::new("cmd")
        .args(["/C", "mklink", "/J", link_s.as_ref(), target_s.as_ref()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("failed to create junction at {}: {e}", link.display()))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "failed to create junction {} -> {}: {}",
            link.display(),
            target.display(),
            err.trim()
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            if let Some(parent) = to.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Spawn helper: canonical python.exe, cwd = portable root, PATH includes embed + Scripts.
pub fn command_portable_python(root: &Path) -> Result<Command, String> {
    let root = process_portable_root(root)?;
    let python = portable_python_exe(&root)?;
    // Re-stat immediately before spawn — AV can quarantine between earlier checks.
    let required = required_python_dll_name(&python)
        .ok_or_else(|| "python.exe missing python3XX.dll import string before spawn".to_string())?;
    let embed = python
        .parent()
        .ok_or_else(|| "invalid python_embeded path".to_string())?
        .to_path_buf();
    let dll = embed.join(&required);
    if !dll_usable(&dll, 1_000_000) {
        return Err(format!(
            "{required} disappeared from {} (antivirus quarantine?). Reinstall ComfyUI.",
            embed.display()
        ));
    }
    unblock_embedded_python(&root);
    // `process_portable_root` returns a real short directory (not a junction).
    let cwd = root.clone();
    let mut cmd = process_cmd::new(&python);
    // Official portable .bat uses portable root as cwd (ComfyUI\… relative paths).
    cmd.current_dir(&cwd);
    apply_portable_path_env(&mut cmd, &root);
    cmd.env("PYTHONNOUSERSITE", "1");
    cmd.env("PYTHONHOME", &embed);
    Ok(cmd)
}

/// PATH dirs so python.exe / torch can resolve VC++ and CUDA companion DLLs.
pub fn portable_runtime_path_dirs(root: &Path) -> Vec<PathBuf> {
    let embed = root.join("python_embeded");
    let mut dirs = vec![embed.clone(), embed.join("Scripts")];
    let torch_lib = embed
        .join("Lib")
        .join("site-packages")
        .join("torch")
        .join("lib");
    if torch_lib.is_dir() {
        dirs.push(torch_lib);
    }
    let library_bin = embed.join("Library").join("bin");
    if library_bin.is_dir() {
        dirs.push(library_bin);
    }
    dirs
}

pub fn apply_portable_path_env(cmd: &mut Command, root: &Path) {
    let dirs = portable_runtime_path_dirs(root);
    let mut new_path = OsString::new();
    for dir in &dirs {
        if dir.is_dir() {
            new_path.push(dir);
            new_path.push(";");
        }
    }
    if let Some(old) = env::var_os("PATH") {
        new_path.push(old);
    }
    cmd.env("PATH", new_path);
}

/// Clear Mark-of-the-Web on embed + torch binaries so Windows will load them.
pub fn unblock_embedded_python(root: &Path) {
    #[cfg(windows)]
    {
        let embed = root.join("python_embeded");
        unblock_dir_shallow(&embed);
        unblock_dir_shallow(&embed.join("Scripts"));
        // Torch/CUDA DLLs often keep Zone.Identifier after extract — WinError 126.
        unblock_dir_shallow(
            &embed
                .join("Lib")
                .join("site-packages")
                .join("torch")
                .join("lib"),
        );
        unblock_dir_shallow(&embed.join("Library").join("bin"));
    }
    #[cfg(not(windows))]
    {
        let _ = root;
    }
}

#[cfg(windows)]
fn unblock_dir_shallow(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        let ext = ext.to_ascii_lowercase();
        if matches!(ext.as_str(), "dll" | "exe" | "pyd") {
            let mut ads = path.as_os_str().to_owned();
            ads.push(":Zone.Identifier");
            let _ = fs::remove_file(Path::new(&ads));
        }
    }
}

pub fn find_portable_root(extract_dir: &Path) -> Result<PathBuf, String> {
    if looks_like_portable_root(extract_dir) {
        return Ok(extract_dir.to_path_buf());
    }
    let entries = fs::read_dir(extract_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && looks_like_portable_root(&path) {
            return Ok(path);
        }
    }
    Err("extracted archive does not look like ComfyUI portable".into())
}

/// Portable tree Comfy `start` loads.
///
/// `install_path` is the runtime-row path (may be `%USERPROFILE%\.ogs\cui` after a
/// MAX_PATH relocate). `{runtimes}/portable` is the extract hint. Extensions must
/// install into the same tree `start` uses, or Comfy returns `missing_node_type`.
pub fn live_portable_root(
    install_path: Option<&Path>,
    runtimes_dir: &Path,
) -> Result<PathBuf, String> {
    if let Some(p) = install_path {
        if p.join("ComfyUI").join("main.py").is_file() {
            return process_portable_root(p);
        }
    }
    let found = find_portable_root(&runtimes_dir.join("portable"))?;
    process_portable_root(&found)
}

pub fn live_portable_root_for_app(app: &AppHandle) -> Result<PathBuf, String> {
    let install = runtime_install_path(app);
    live_portable_root(install.as_deref(), &runtimes_dir(app)?)
}

fn runtime_install_path(app: &AppHandle) -> Option<PathBuf> {
    let state = app.try_state::<crate::commands::AppState>()?;
    let db = state.db.lock().ok()?;
    let rt = db.get_runtime_by_engine(ENGINE).ok()??;
    if rt.install_path.is_empty() {
        None
    } else {
        Some(PathBuf::from(rt.install_path))
    }
}

pub(crate) fn write_extra_model_paths(portable_root: &Path, models: &Path) -> Result<(), String> {
    fs::create_dir_all(models).map_err(|e| e.to_string())?;
    for sub in [
        "checkpoints",
        "loras",
        "vae",
        "diffusion_models",
        "text_encoders",
        "clip",
        "clip_vision",
        "controlnet",
        "embeddings",
        "upscale_models",
        "LLM",
    ] {
        fs::create_dir_all(models.join(sub)).map_err(|e| e.to_string())?;
    }

    // Unpackaged Comfy must see the real disk path. Under MSIX, `AppData\Roaming\…`
    // is a virtualized view — the files live in `Packages\…\LocalCache\…`.
    let models_real = crate::app_paths::path_visible_outside_msix(models);
    let models_posix = models_real.to_string_lossy().replace('\\', "/");
    let yaml = format!(
        r#"# Managed by Open Gen Studio - shared model library
open_gen_studio:
  base_path: "{models_posix}"
  is_default: true
  checkpoints: checkpoints
  loras: loras
  vae: vae
  diffusion_models: diffusion_models
  text_encoders: text_encoders
  clip: clip
  clip_vision: clip_vision
  controlnet: controlnet
  embeddings: embeddings
  upscale_models: upscale_models
  LLM: LLM
"#
    );
    let path = portable_root.join("ComfyUI").join("extra_model_paths.yaml");
    let mut file = fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(yaml.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn portable_python_requires_exact_imported_dll() {
        let root = std::env::temp_dir().join(format!("oga_py_dll_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let embed = root.join("python_embeded");
        fs::create_dir_all(&embed).unwrap();
        fs::create_dir_all(root.join("ComfyUI")).unwrap();
        fs::write(root.join("ComfyUI").join("main.py"), b"#").unwrap();

        // Tiny stub exe — rejected.
        fs::write(embed.join("python.exe"), vec![0u8; 100]).unwrap();
        assert!(portable_python_exe(&root).is_err());

        // Real-sized exe that imports python313.dll, but DLL missing — rejected.
        let mut exe = vec![0u8; 20_000];
        exe.extend_from_slice(b"python313.dll");
        fs::write(embed.join("python.exe"), &exe).unwrap();
        assert!(portable_python_exe(&root).is_err());
        assert!(!portable_ready(&root));

        // Wrong large DLL (312) while exe wants 313 — still rejected.
        let mut wrong = fs::File::create(embed.join("python312.dll")).unwrap();
        wrong.write_all(&vec![0u8; 1_500_000]).unwrap();
        assert!(portable_python_exe(&root).is_err());

        // Matching python313.dll — accepted.
        let mut dll = fs::File::create(embed.join("python313.dll")).unwrap();
        dll.write_all(&vec![0u8; 1_500_000]).unwrap();
        assert!(portable_python_exe(&root).is_ok());
        assert!(portable_ready(&root));

        let _ = fs::remove_dir_all(&root);
    }

    fn fake_portable(dir: &Path) {
        fs::create_dir_all(dir.join("python_embeded")).unwrap();
        fs::create_dir_all(dir.join("ComfyUI").join("custom_nodes")).unwrap();
        fs::write(dir.join("ComfyUI").join("main.py"), b"#").unwrap();
    }

    #[test]
    fn extensions_install_into_the_tree_comfy_starts() {
        // Other-machine symptom: /prompt 400 missing_node_type UltimateSDUpscale.
        // Ensure wrote the pack under runtimes/portable; start loaded .ogs\cui.
        let root = std::env::temp_dir().join(format!(
            "oga_ext_roots_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&root);
        let runtimes = root.join("runtimes").join("comfyui");
        let extract = runtimes.join("portable");
        let start_tree = root.join("ogs-cui");
        fake_portable(&extract);
        fake_portable(&start_tree);
        fs::create_dir_all(
            extract
                .join("ComfyUI")
                .join("custom_nodes")
                .join("ComfyUI_UltimateSDUpscale"),
        )
        .unwrap();

        let live = live_portable_root(Some(&start_tree), &runtimes).unwrap();
        let start = process_portable_root(&start_tree).unwrap();
        assert_eq!(
            live,
            start,
            "extensions must install into the tree Comfy start() loads (got {}, start {})",
            live.display(),
            start.display()
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn live_portable_falls_back_to_extract_without_install_path() {
        let root = std::env::temp_dir().join(format!(
            "oga_ext_fallback_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&root);
        let runtimes = root.join("runtimes").join("comfyui");
        fake_portable(&runtimes.join("portable"));
        let live = live_portable_root(None, &runtimes).unwrap();
        let expected = process_portable_root(&runtimes.join("portable")).unwrap();
        assert_eq!(live, expected);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn extra_model_paths_quotes_canonical_base() {
        let root = std::env::temp_dir().join(format!("oga_extra_paths_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let portable = root.join("portable");
        fs::create_dir_all(portable.join("ComfyUI")).unwrap();
        let models = root.join("Open Gen Studio").join("models");
        write_extra_model_paths(&portable, &models).unwrap();
        let yaml =
            fs::read_to_string(portable.join("ComfyUI").join("extra_model_paths.yaml")).unwrap();
        assert!(yaml.contains("base_path: \""), "{yaml}");
        assert!(yaml.contains("checkpoints: checkpoints"), "{yaml}");
        let _ = fs::remove_dir_all(&root);
    }
}
