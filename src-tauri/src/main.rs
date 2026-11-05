#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, io::ErrorKind, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
struct StoreLock(Mutex<()>);

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("library.json"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_library(app: AppHandle, lock: State<'_, StoreLock>) -> Result<Option<String>, String> {
    let _guard = lock.0.lock().map_err(|error| error.to_string())?;
    match fs::read_to_string(store_path(&app)?) {
        Ok(data) => Ok(Some(data)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_library(app: AppHandle, lock: State<'_, StoreLock>, data: String) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|error| error.to_string())?;
    serde_json::from_str::<serde_json::Value>(&data).map_err(|error| error.to_string())?;
    let path = store_path(&app)?;
    let directory = path.parent().ok_or("应用数据目录不可用")?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, data).map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(StoreLock::default())
        .invoke_handler(tauri::generate_handler![load_library, save_library])
        .run(tauri::generate_context!())
        .expect("无法启动 Meletia");
}
