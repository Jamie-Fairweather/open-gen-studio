//! Process helpers. On Windows GUI builds, child console apps (git, nvidia-smi,
//! cmd, python.exe, …) flash a visible terminal unless CREATE_NO_WINDOW is set.

use std::ffi::OsStr;
use std::process::Command;

#[cfg(windows)]
mod win {
    // https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags
    pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    pub const CREATE_BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
}

/// Like [`Command::new`], but never shows a console window on Windows.
pub fn new(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(win::CREATE_NO_WINDOW);
    }
    cmd
}

/// Like [`new`], but starts at Below Normal priority on Windows so GPU-heavy
/// children (ComfyUI) yield CPU scheduling to the studio UI. Child processes
/// inherit the priority class.
pub fn new_below_normal(program: impl AsRef<OsStr>) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new(program);
        cmd.creation_flags(win::CREATE_NO_WINDOW | win::CREATE_BELOW_NORMAL_PRIORITY_CLASS);
        cmd
    }
    #[cfg(not(windows))]
    {
        new(program)
    }
}
