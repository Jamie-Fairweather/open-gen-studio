//! Process helpers. On Windows GUI builds, child console apps (git, nvidia-smi,
//! cmd, python.exe, …) flash a visible terminal unless CREATE_NO_WINDOW is set.

use std::ffi::OsStr;
use std::process::Command;

/// Like [`Command::new`], but never shows a console window on Windows.
pub fn new(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
