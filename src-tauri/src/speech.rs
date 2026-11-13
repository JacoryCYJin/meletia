use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tauri::State;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Accent {
    Uk,
    Us,
}

impl Accent {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "uk" => Ok(Self::Uk),
            "us" => Ok(Self::Us),
            _ => Err("未知的发音类型。".into()),
        }
    }

    fn language(self) -> &'static str {
        match self {
            Self::Uk => "en-GB",
            Self::Us => "en-US",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Uk => "英式",
            Self::Us => "美式",
        }
    }
}

#[derive(Debug)]
pub(crate) enum SpeechReply {
    Started,
    Superseded,
    Error(String),
}

#[derive(Default)]
struct SpeechArbiter {
    latest: Option<String>,
    active: Option<String>,
}

impl SpeechArbiter {
    fn register(&mut self, token: &str) {
        self.latest = Some(token.to_owned());
    }

    fn cancel(&mut self, token: &str) -> bool {
        if self.latest.as_deref() == Some(token) {
            self.latest = None;
            true
        } else {
            false
        }
    }

    fn should_start(&self, token: &str) -> bool {
        self.latest.as_deref() == Some(token)
    }

    fn started(&mut self, token: &str) {
        self.active = Some(token.to_owned());
    }

    fn should_stop(&self, token: &str) -> bool {
        self.active.as_deref() == Some(token)
    }

    fn stopped(&mut self, token: &str) {
        if self.active.as_deref() == Some(token) {
            self.active = None;
        }
    }
}

fn lock_arbiter(arbiter: &Mutex<SpeechArbiter>) -> MutexGuard<'_, SpeechArbiter> {
    arbiter
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn language_matches(actual: &str, expected: &str) -> bool {
    actual.replace('_', "-").eq_ignore_ascii_case(expected)
}

#[cfg(target_os = "macos")]
mod imp {
    use std::{
        sync::{
            mpsc::{self, Receiver, Sender},
            Arc, Mutex,
        },
        thread,
    };

    use objc2_avf_audio::{
        AVSpeechBoundary, AVSpeechSynthesisVoice, AVSpeechSynthesizer, AVSpeechUtterance,
    };
    use objc2_foundation::NSString;
    use tokio::sync::oneshot;

    use super::{lock_arbiter, language_matches, Accent, SpeechArbiter, SpeechReply};

    enum SpeechCommand {
        Speak {
            token: String,
            text: String,
            accent: Accent,
            reply: oneshot::Sender<SpeechReply>,
        },
        Stop {
            token: String,
        },
    }

    struct SpeechInner {
        tx: Sender<SpeechCommand>,
        arbiter: Arc<Mutex<SpeechArbiter>>,
    }

    #[derive(Clone)]
    pub struct SpeechState {
        inner: Arc<SpeechInner>,
    }

    impl SpeechState {
        pub fn new() -> Result<Self, String> {
            let (tx, rx) = mpsc::channel();
            let arbiter = Arc::new(Mutex::new(SpeechArbiter::default()));
            let worker_arbiter = Arc::clone(&arbiter);
            thread::Builder::new()
                .name("meletia-speech".into())
                .spawn(move || worker_loop(rx, worker_arbiter))
                .map_err(|error| format!("无法启动发音线程：{error}"))?;
            Ok(Self {
                inner: Arc::new(SpeechInner { tx, arbiter }),
            })
        }

        pub fn prepare(
            &self,
            token: &str,
            text: &str,
            accent: &str,
        ) -> Result<oneshot::Receiver<SpeechReply>, String> {
            let token = token.trim();
            if token.is_empty() {
                return Err("发音请求标识无效。".into());
            }
            let text = text.trim();
            if text.is_empty() {
                return Err("没有可朗读的内容。".into());
            }
            let accent = Accent::parse(accent)?;
            let (reply, receiver) = oneshot::channel();
            {
                let mut arbiter = lock_arbiter(&self.inner.arbiter);
                arbiter.register(token);
                if self
                    .inner
                    .tx
                    .send(SpeechCommand::Speak {
                        token: token.to_owned(),
                        text: text.to_owned(),
                        accent,
                        reply,
                    })
                    .is_err()
                {
                    arbiter.cancel(token);
                    return Err("发音线程不可用，请重启应用。".into());
                }
            }
            Ok(receiver)
        }

        pub fn cancel(&self, token: &str) {
            let token = token.trim();
            {
                let mut arbiter = lock_arbiter(&self.inner.arbiter);
                arbiter.cancel(token);
            }
            let _ = self.inner.tx.send(SpeechCommand::Stop {
                token: token.to_owned(),
            });
        }
    }

    impl Default for SpeechState {
        fn default() -> Self {
            Self::new().expect("无法启动发音线程")
        }
    }

    fn worker_loop(rx: Receiver<SpeechCommand>, arbiter: Arc<Mutex<SpeechArbiter>>) {
        let synthesizer = unsafe { AVSpeechSynthesizer::new() };
        while let Ok(command) = rx.recv() {
            match command {
                SpeechCommand::Speak {
                    token,
                    text,
                    accent,
                    reply,
                } => {
                    let result = {
                        let mut state = lock_arbiter(&arbiter);
                        if !state.should_start(&token) {
                            result_log("skip", &token, None);
                            SpeechReply::Superseded
                        } else {
                            stop_active(&synthesizer, &mut state);
                            match speak(&synthesizer, accent, &text) {
                                Ok(voice) => {
                                    state.started(&token);
                                    result_log("start", &token, Some((accent, voice)));
                                    SpeechReply::Started
                                }
                                Err(error) => {
                                    result_log("error", &token, None);
                                    SpeechReply::Error(error)
                                }
                            }
                        }
                    };
                    let _ = reply.send(result);
                }
                SpeechCommand::Stop { token } => {
                    let mut state = lock_arbiter(&arbiter);
                    if state.should_stop(&token) {
                        unsafe {
                            synthesizer.stopSpeakingAtBoundary(AVSpeechBoundary::Immediate);
                        }
                        state.stopped(&token);
                        stop_log(&token);
                    }
                }
            }
        }
    }

    fn speak(
        synthesizer: &AVSpeechSynthesizer,
        accent: Accent,
        text: &str,
    ) -> Result<(String, String), String> {
        let language = NSString::from_str(accent.language());
        let voice = unsafe { AVSpeechSynthesisVoice::voiceWithLanguage(Some(&language)) };
        let Some(voice) = voice else {
            return Err(format!(
                "系统未安装{}语音（{}）。本次不会改用另一种口音。",
                accent.label(),
                accent.language()
            ));
        };
        let actual_language = unsafe { voice.language() }.to_string();
        if !language_matches(&actual_language, accent.language()) {
            return Err(format!(
                "系统返回的{}语音语言为 {}，与请求的 {} 不一致，已取消播放。",
                accent.label(),
                actual_language,
                accent.language()
            ));
        }
        let voice_name = unsafe { voice.name() }.to_string();
        let text = NSString::from_str(text);
        let utterance = unsafe { AVSpeechUtterance::speechUtteranceWithString(&text) };
        unsafe {
            utterance.setVoice(Some(&voice));
            synthesizer.speakUtterance(&utterance);
        }
        Ok((voice_name, actual_language))
    }

    fn stop_active(synthesizer: &AVSpeechSynthesizer, state: &mut SpeechArbiter) {
        if state.active.is_some() {
            unsafe {
                synthesizer.stopSpeakingAtBoundary(AVSpeechBoundary::Immediate);
            }
            state.active = None;
        }
    }

    #[cfg(debug_assertions)]
    fn result_log(action: &str, token: &str, voice: Option<(Accent, (String, String))>) {
        match voice {
            Some((accent, (name, language))) => eprintln!(
                "[speech] {action} token={token} accent={} voice={name} language={language}",
                accent.label()
            ),
            None => eprintln!("[speech] {action} token={token}"),
        }
    }

    #[cfg(not(debug_assertions))]
    fn result_log(_action: &str, _token: &str, _voice: Option<(Accent, (String, String))>) {}

    #[cfg(debug_assertions)]
    fn stop_log(token: &str) {
        eprintln!("[speech] stop token={token}");
    }

    #[cfg(not(debug_assertions))]
    fn stop_log(_token: &str) {}
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use tokio::sync::oneshot;

    use super::SpeechReply;

    #[derive(Clone, Default)]
    pub struct SpeechState;

    impl SpeechState {
        pub fn prepare(
            &self,
            _token: &str,
            _text: &str,
            _accent: &str,
        ) -> Result<oneshot::Receiver<SpeechReply>, String> {
            Err("发音仅在 macOS 桌面版可用。".into())
        }

        pub fn cancel(&self, _token: &str) {}
    }
}

pub use imp::SpeechState;

#[tauri::command]
pub async fn speak_text(
    state: State<'_, SpeechState>,
    token: String,
    text: String,
    accent: String,
) -> Result<bool, String> {
    let speech = state.inner().clone();
    let reply = speech.prepare(&token, &text, &accent)?;
    match tokio::time::timeout(Duration::from_secs(2), reply).await {
        Ok(Ok(SpeechReply::Started)) => Ok(true),
        Ok(Ok(SpeechReply::Superseded)) => Ok(false),
        Ok(Ok(SpeechReply::Error(message))) => Err(message),
        Ok(Err(_)) => Err("发音线程已停止，请重启应用。".into()),
        Err(_) => {
            speech.cancel(&token);
            Err("发音请求超时，请重试。".into())
        }
    }
}

#[tauri::command]
pub fn stop_speech(state: State<'_, SpeechState>, token: String) -> Result<(), String> {
    state.inner().cancel(&token);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accents_map_to_exact_system_languages() {
        assert_eq!(Accent::parse("uk").unwrap().language(), "en-GB");
        assert_eq!(Accent::parse("us").unwrap().language(), "en-US");
        assert!(Accent::parse("gb").is_err());
        assert!(Accent::parse("EN-US").is_err());
    }

    #[test]
    fn language_labels_are_compared_after_normalization() {
        assert!(language_matches("en-GB", "en-GB"));
        assert!(language_matches("en_GB", "en-GB"));
        assert!(language_matches("en-gb", "en-GB"));
        assert!(!language_matches("en-US", "en-GB"));
    }

    #[test]
    fn newer_request_supersedes_a_queued_request() {
        let mut arbiter = SpeechArbiter::default();
        arbiter.register("old");
        arbiter.register("new");
        assert!(!arbiter.should_start("old"));
        assert!(arbiter.should_start("new"));
    }

    #[test]
    fn cancel_only_clears_the_matching_latest_request() {
        let mut arbiter = SpeechArbiter::default();
        arbiter.register("old");
        arbiter.register("new");
        assert!(!arbiter.cancel("old"));
        assert!(arbiter.should_start("new"));
        assert!(arbiter.cancel("new"));
        assert!(!arbiter.should_start("new"));
    }

    #[test]
    fn stale_stop_does_not_match_the_new_active_request() {
        let mut arbiter = SpeechArbiter::default();
        arbiter.register("old");
        arbiter.started("old");
        arbiter.register("new");
        arbiter.started("new");
        assert!(!arbiter.should_stop("old"));
        assert!(arbiter.should_stop("new"));
        arbiter.stopped("new");
        assert!(!arbiter.should_stop("new"));
    }

    #[test]
    fn speech_state_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<SpeechState>();
    }
}
