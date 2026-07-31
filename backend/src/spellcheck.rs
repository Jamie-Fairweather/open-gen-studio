//! OS spell suggestions for the custom editable context menu.

#[cfg(windows)]
mod windows_impl {
    use std::sync::OnceLock;
    use windows::core::{w, PWSTR};
    use windows::Win32::Globalization::{ISpellChecker, ISpellCheckerFactory, SpellCheckerFactory};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };

    // SpellChecker COM objects are apartment-threaded; keep one on a dedicated thread.
    static SPELL_THREAD: OnceLock<std::sync::mpsc::SyncSender<Job>> = OnceLock::new();

    struct Job {
        word: String,
        reply: std::sync::mpsc::SyncSender<Result<Vec<String>, String>>,
    }

    fn ensure_worker() -> &'static std::sync::mpsc::SyncSender<Job> {
        SPELL_THREAD.get_or_init(|| {
            let (tx, rx) = std::sync::mpsc::sync_channel::<Job>(8);
            std::thread::Builder::new()
                .name("spellcheck".into())
                .spawn(move || {
                    unsafe {
                        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
                    }
                    let checker = match create_checker() {
                        Ok(c) => c,
                        Err(e) => {
                            log::warn!("spellcheck unavailable: {e}");
                            // Drain jobs with errors so callers don't hang.
                            while let Ok(job) = rx.recv() {
                                let _ = job.reply.send(Err(e.clone()));
                            }
                            return;
                        }
                    };
                    while let Ok(job) = rx.recv() {
                        let _ = job.reply.send(suggest_with(&checker, &job.word));
                    }
                })
                .expect("spawn spellcheck worker");
            tx
        })
    }

    fn create_checker() -> Result<ISpellChecker, String> {
        unsafe {
            let factory: ISpellCheckerFactory =
                CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| format!("spell checker factory: {e}"))?;

            // Prefer UI language, then en-US.
            for tag in [w!("en-US"), w!("en-GB"), w!("en")] {
                if factory
                    .IsSupported(tag)
                    .map(|v| v.as_bool())
                    .unwrap_or(false)
                {
                    return factory
                        .CreateSpellChecker(tag)
                        .map_err(|e| format!("create spell checker: {e}"));
                }
            }
            Err("no supported spellcheck language".into())
        }
    }

    fn suggest_with(checker: &ISpellChecker, word: &str) -> Result<Vec<String>, String> {
        let word = word.trim();
        if word.is_empty() || word.chars().count() > 64 {
            return Ok(Vec::new());
        }

        unsafe {
            let wide: Vec<u16> = word.encode_utf16().chain(std::iter::once(0)).collect();
            let pcw = windows::core::PCWSTR(wide.as_ptr());

            // Suggest returns S_FALSE + the same word when correctly spelled.
            let enum_str = checker.Suggest(pcw).map_err(|e| e.to_string())?;
            let mut out = Vec::new();
            let word_lower = word.to_lowercase();

            loop {
                let mut buf = [PWSTR::null()];
                let mut fetched = 0u32;
                let next_hr = enum_str.Next(&mut buf, Some(&mut fetched));
                if fetched == 0 || buf[0].is_null() {
                    break;
                }
                let suggestion = buf[0].to_string().unwrap_or_default();
                CoTaskMemFree(Some(buf[0].as_ptr() as *const _));
                if !suggestion.is_empty() && suggestion.to_lowercase() != word_lower {
                    out.push(suggestion);
                }
                if out.len() >= 5 || next_hr.is_err() {
                    break;
                }
            }

            Ok(out)
        }
    }

    pub fn suggest(word: &str) -> Result<Vec<String>, String> {
        let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
        ensure_worker()
            .send(Job {
                word: word.to_string(),
                reply: reply_tx,
            })
            .map_err(|_| "spellcheck worker stopped".to_string())?;
        reply_rx
            .recv_timeout(std::time::Duration::from_millis(800))
            .map_err(|_| "spellcheck timed out".to_string())?
    }
}

#[cfg(not(windows))]
mod stub {
    pub fn suggest(_word: &str) -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }
}

#[cfg(windows)]
pub use windows_impl::suggest;

#[cfg(not(windows))]
pub use stub::suggest;

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn suggests_for_misspelling() {
        let suggestions = super::suggest("nic").expect("spellcheck");
        assert!(
            suggestions.iter().any(|s| s.eq_ignore_ascii_case("nice")),
            "expected 'nice' in {suggestions:?}"
        );
    }
}
