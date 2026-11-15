#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod export;
mod library;
mod speech;

fn main() {
    tauri::Builder::default()
        .manage(library::StoreLock::default())
        .manage(speech::SpeechState::default())
        .invoke_handler(tauri::generate_handler![
            library::load_library,
            library::save_library,
            library::migrate_library,
            export::save_study_export,
            speech::speak_text,
            speech::stop_speech
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 Meletia");
}
