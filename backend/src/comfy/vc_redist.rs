//! Visual C++ runtime for portable Python.
//!
//! Clean Windows VMs / Store certification PCs often lack VC++ redistributable.
//! Python then fails at launch with "VCRUNTIME140.dll was not found".
//!
//! For MSIX / packaged hosts, System32 alone is not enough — the DLLs must sit
//! next to `python_embeded\python.exe`. We ship app-local copies under
//! `backend/resources/vc140/` and write them into the portable embed folder.

use std::path::Path;
use tauri::AppHandle;

/// Ensure VC++ runtime DLLs exist **next to** portable `python.exe`.
pub fn ensure_vc_runtime(app: &AppHandle, root: &Path) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = (app, root);
        Ok(())
    }
    #[cfg(windows)]
    {
        windows::ensure(app, root)
    }
}

/// Quiet-install the machine VC++ redist, then refresh app-local DLLs.
/// Used when `import torch` fails with WinError 126.
pub fn force_install_vc_redist(app: &AppHandle, root: &Path) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = (app, root);
        Ok(())
    }
    #[cfg(windows)]
    {
        windows::force_install_vc_redist(app, root)
    }
}

#[cfg(windows)]
mod windows {
    use crate::pins::VC_REDIST_X64_URL;
    use crate::process_cmd;
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Stdio;
    use tauri::AppHandle;

    /// App-local MSVC DLLs shipped under resources/vc140/ (python + torch).
    const BUNDLED_RUNTIME_DLLS: &[&str] = &[
        "vcruntime140.dll",
        "vcruntime140_1.dll",
        "msvcp140.dll",
        "msvcp140_1.dll",
        "msvcp140_2.dll",
        "concrt140.dll",
        "vcomp140.dll",
    ];
    /// msvcp140_1.dll is legitimately ~35KB on current MSVC redists.
    const MIN_DLL_BYTES: u64 = 20_000;

    // Official MSVC redistributable DLLs (see backend/resources/vc140/README.md).
    const BUNDLED_VCRUNTIME140: &[u8] = include_bytes!("../../resources/vc140/vcruntime140.dll");
    const BUNDLED_VCRUNTIME140_1: &[u8] =
        include_bytes!("../../resources/vc140/vcruntime140_1.dll");
    const BUNDLED_MSVCP140: &[u8] = include_bytes!("../../resources/vc140/msvcp140.dll");
    const BUNDLED_MSVCP140_1: &[u8] = include_bytes!("../../resources/vc140/msvcp140_1.dll");
    const BUNDLED_MSVCP140_2: &[u8] = include_bytes!("../../resources/vc140/msvcp140_2.dll");
    const BUNDLED_CONCRT140: &[u8] = include_bytes!("../../resources/vc140/concrt140.dll");
    const BUNDLED_VCOMP140: &[u8] = include_bytes!("../../resources/vc140/vcomp140.dll");

    pub(super) fn ensure(app: &AppHandle, root: &Path) -> Result<(), String> {
        let embed = root.join("python_embeded");
        if !embed.is_dir() {
            return Err("ComfyUI python_embeded folder missing".into());
        }

        // 1) Bundled app-local DLLs — works offline, no admin, works under MSIX.
        write_bundled_runtime_dlls(&embed)?;
        let _ = copy_runtime_from_host_exe_dir(&embed);
        if has_app_local_vcruntime(&embed) {
            unblock_runtime_dlls(&embed);
            return Ok(());
        }

        // 2) Copy from System32 / host exe dir if bundle write failed.
        let _ = copy_named_runtime_from_dir(&embed, &system32_dir(), BUNDLED_RUNTIME_DLLS);
        let _ = copy_runtime_from_host_exe_dir(&embed);
        if has_app_local_vcruntime(&embed) {
            unblock_runtime_dlls(&embed);
            return Ok(());
        }

        // 3) Last resort: quiet machine install, then copy into python_embeded.
        super::super::paths::emit_progress(app, "python-deps", "Installing Visual C++ runtime…");
        let installer = download_vc_redist(app)?;
        if let Err(err) = install_vc_redist_quiet(&installer) {
            log::warn!("VC redist quiet install failed: {err}");
        }
        let _ = copy_named_runtime_from_dir(&embed, &system32_dir(), BUNDLED_RUNTIME_DLLS);
        if has_app_local_vcruntime(&embed) {
            unblock_runtime_dlls(&embed);
            return Ok(());
        }

        Err("Could not place VCRUNTIME140.dll next to portable Python. \
Install the Visual C++ Redistributable from https://aka.ms/vs/17/release/vc_redist.x64.exe \
then tap Retry."
            .into())
    }

    /// Force the quiet VC redist installer (used when torch fails with WinError 126).
    pub fn force_install_vc_redist(app: &AppHandle, root: &Path) -> Result<(), String> {
        let embed = root.join("python_embeded");
        if !embed.is_dir() {
            return Err("ComfyUI python_embeded folder missing".into());
        }
        let installer = download_vc_redist(app)?;
        // Quiet install often needs admin / fails under MSIX — still refresh app-local DLLs.
        if let Err(err) = install_vc_redist_quiet(&installer) {
            log::warn!("VC redist quiet install failed: {err}");
        }
        let _ = copy_named_runtime_from_dir(&embed, &system32_dir(), BUNDLED_RUNTIME_DLLS);
        write_bundled_runtime_dlls(&embed)?;
        unblock_runtime_dlls(&embed);
        Ok(())
    }

    fn write_bundled_runtime_dlls(embed: &Path) -> Result<(), String> {
        let files: &[(&str, &[u8])] = &[
            ("vcruntime140.dll", BUNDLED_VCRUNTIME140),
            ("vcruntime140_1.dll", BUNDLED_VCRUNTIME140_1),
            ("msvcp140.dll", BUNDLED_MSVCP140),
            ("msvcp140_1.dll", BUNDLED_MSVCP140_1),
            ("msvcp140_2.dll", BUNDLED_MSVCP140_2),
            ("concrt140.dll", BUNDLED_CONCRT140),
            ("vcomp140.dll", BUNDLED_VCOMP140),
        ];
        for (name, bytes) in files {
            if ((*bytes).len() as u64) < MIN_DLL_BYTES {
                return Err(format!("bundled {name} looks corrupt"));
            }
            let dest = embed.join(name);
            if dll_usable(&dest) {
                continue;
            }
            fs::write(&dest, bytes)
                .map_err(|e| format!("failed to write bundled {name} into python_embeded: {e}"))?;
        }
        Ok(())
    }

    fn has_app_local_vcruntime(embed: &Path) -> bool {
        dll_usable(&embed.join("vcruntime140.dll"))
    }

    fn dll_usable(path: &Path) -> bool {
        fs::metadata(path)
            .map(|m| m.is_file() && m.len() >= MIN_DLL_BYTES)
            .unwrap_or(false)
    }

    fn system32_dir() -> PathBuf {
        let windir = env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into());
        PathBuf::from(windir).join("System32")
    }

    fn copy_named_runtime_from_dir(
        embed: &Path,
        src_dir: &Path,
        names: &[&str],
    ) -> Result<(), String> {
        for name in names {
            let dest = embed.join(name);
            if dll_usable(&dest) {
                continue;
            }
            let src = src_dir.join(name);
            if dll_usable(&src) {
                fs::copy(&src, &dest)
                    .map_err(|e| format!("failed to copy {name} into python_embeded: {e}"))?;
            }
        }
        Ok(())
    }

    fn copy_runtime_from_host_exe_dir(embed: &Path) -> Result<(), String> {
        let exe = env::current_exe().map_err(|e| e.to_string())?;
        let Some(dir) = exe.parent() else {
            return Ok(());
        };
        let _ = copy_named_runtime_from_dir(embed, dir, BUNDLED_RUNTIME_DLLS);
        Ok(())
    }

    fn download_vc_redist(app: &AppHandle) -> Result<PathBuf, String> {
        let dest = crate::app_paths::app_data_dir(app)?
            .join("downloads")
            .join("vc_redist.x64.exe");
        if !dest.is_file()
            || fs::metadata(&dest)
                .map(|m| m.len() < 1_000_000)
                .unwrap_or(true)
        {
            crate::download::download_file(app, VC_REDIST_X64_URL, &dest, None)?;
        }
        Ok(dest)
    }

    fn install_vc_redist_quiet(installer: &Path) -> Result<(), String> {
        let status = process_cmd::new(installer)
            .args(["/install", "/quiet", "/norestart"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("failed to launch VC redist installer: {e}"))?;
        let code = status.code().unwrap_or(-1);
        if matches!(code, 0 | 1638 | 3010) {
            Ok(())
        } else {
            Err(format!("VC redist installer exit {code}"))
        }
    }

    fn unblock_runtime_dlls(embed: &Path) {
        for name in BUNDLED_RUNTIME_DLLS {
            let path = embed.join(name);
            if !path.is_file() {
                continue;
            }
            let mut ads = path.as_os_str().to_owned();
            ads.push(":Zone.Identifier");
            let _ = fs::remove_file(Path::new(&ads));
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn bundled_dlls_meet_min_size() {
            assert!(BUNDLED_VCRUNTIME140.len() as u64 >= MIN_DLL_BYTES);
            assert!(BUNDLED_VCRUNTIME140_1.len() as u64 >= MIN_DLL_BYTES);
            assert!(BUNDLED_MSVCP140.len() as u64 >= MIN_DLL_BYTES);
            assert!(BUNDLED_MSVCP140_1.len() as u64 >= MIN_DLL_BYTES);
            assert!(BUNDLED_MSVCP140_2.len() as u64 >= MIN_DLL_BYTES);
            assert!(BUNDLED_CONCRT140.len() as u64 >= MIN_DLL_BYTES);
            assert!(BUNDLED_VCOMP140.len() as u64 >= MIN_DLL_BYTES);
        }

        #[test]
        fn write_bundled_creates_app_local_vcruntime() {
            let root =
                std::env::temp_dir().join(format!("oga_vc_bundle_test_{}", std::process::id()));
            let _ = fs::remove_dir_all(&root);
            fs::create_dir_all(&root).unwrap();
            write_bundled_runtime_dlls(&root).unwrap();
            assert!(has_app_local_vcruntime(&root));
            let _ = fs::remove_dir_all(&root);
        }
    }
}
