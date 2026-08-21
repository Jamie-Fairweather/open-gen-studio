//! Process helpers. On Windows GUI builds, child console apps (git, nvidia-smi,
//! cmd, python.exe, …) flash a visible terminal unless CREATE_NO_WINDOW is set.

use std::ffi::OsStr;
use std::io::{self, Read};
use std::process::{Command, Output, Stdio};
use std::sync::Once;
use std::time::{Duration, Instant};

#[cfg(windows)]
mod win {
    // https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags
    pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    pub const CREATE_BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
}

/// Suppress Windows "DLL was not found" / critical-error message boxes for this
/// process (and children that inherit the error mode). Call once at startup.
pub fn suppress_win32_error_dialogs() {
    #[cfg(windows)]
    {
        static ONCE: Once = Once::new();
        ONCE.call_once(|| {
            use windows::Win32::System::Diagnostics::Debug::{
                SetErrorMode, SEM_FAILCRITICALERRORS, SEM_NOOPENFILEERRORBOX,
            };
            unsafe {
                let _ = SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOOPENFILEERRORBOX);
            }
        });
    }
}

/// Like [`Command::new`], but never shows a console window on Windows.
pub fn new(program: impl AsRef<OsStr>) -> Command {
    suppress_win32_error_dialogs();
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(win::CREATE_NO_WINDOW);
    }
    cmd
}

/// Run a command and collect output, killing it if `timeout` elapses.
/// Use for probes (`nvidia-smi`, WMI) that can hang in VMs / broken drivers.
pub fn output_timed(mut cmd: Command, timeout: Duration) -> io::Result<Output> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn()?;
    let started = Instant::now();
    loop {
        match child.try_wait()? {
            Some(status) => {
                let mut stdout = Vec::new();
                let mut stderr = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    out.read_to_end(&mut stdout)?;
                }
                if let Some(mut err) = child.stderr.take() {
                    err.read_to_end(&mut stderr)?;
                }
                return Ok(Output {
                    status,
                    stdout,
                    stderr,
                });
            }
            None => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(io::Error::new(
                        io::ErrorKind::TimedOut,
                        format!("process timed out after {timeout:?}"),
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }
}

/// Like [`new`], but starts at Below Normal priority on Windows so GPU-heavy
/// children (ComfyUI) yield CPU scheduling to the studio UI. Child processes
/// inherit the priority class.
pub fn new_below_normal(program: impl AsRef<OsStr>) -> Command {
    suppress_win32_error_dialogs();
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
