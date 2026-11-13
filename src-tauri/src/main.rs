#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

mod speech;

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
    save_current_library(&store_path(&app)?, &data)
}

fn data_version(data: &str) -> Result<Option<u64>, String> {
    let json =
        serde_json::from_str::<serde_json::Value>(data).map_err(|error| error.to_string())?;
    Ok(json["version"].as_u64())
}

fn save_current_library(path: &Path, data: &str) -> Result<(), String> {
    let version = data_version(data)?;
    match fs::read_to_string(path) {
        Ok(current) if data_version(&current)? != version => {
            return Err("数据版本已变化，请通过带备份的迁移流程保存。".into());
        }
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    write_library(path, data)
}

fn write_library(path: &Path, data: &str) -> Result<(), String> {
    let directory = path.parent().ok_or("应用数据目录不可用")?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, data).map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

#[tauri::command]
fn migrate_library(
    app: AppHandle,
    lock: State<'_, StoreLock>,
    original: String,
    data: String,
) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|error| error.to_string())?;
    migrate_library_at(&store_path(&app)?, &original, &data)
}

fn migrate_library_at(path: &Path, original: &str, data: &str) -> Result<(), String> {
    if data_version(data)? <= data_version(original)? {
        return Err("迁移必须升级数据版本。".into());
    }
    if fs::read_to_string(path).map_err(|error| error.to_string())? != original {
        return Err("迁移前数据已变化，请重新载入。".into());
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let backup = path.with_file_name(format!("library-before-migration-{timestamp}.json"));
    fs::copy(path, &backup).map_err(|error| error.to_string())?;
    fs::File::open(backup)
        .and_then(|file| file.sync_all())
        .map_err(|error| error.to_string())?;
    write_library(path, data)
}

#[tauri::command]
fn save_study_export(app: AppHandle, filename: String, csv: String) -> Result<String, String> {
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?
        .join("Meletia");
    save_study_export_at(&directory, &filename, &csv)
        .map(|path| path.to_string_lossy().into_owned())
}

fn save_study_export_at(directory: &Path, filename: &str, csv: &str) -> Result<PathBuf, String> {
    let stamp = filename
        .strip_prefix("词语状态_")
        .and_then(|name| name.strip_suffix(".csv"))
        .ok_or("导出文件名无效。")?;
    if stamp.is_empty()
        || filename.len() > 160
        || !stamp
            .chars()
            .all(|c| c.is_ascii_digit() || c == '-' || c == '_')
    {
        return Err("导出文件名无效。".into());
    }
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let stem = filename.strip_suffix(".csv").unwrap();
    for index in 0..1000 {
        let name = if index == 0 {
            filename.to_owned()
        } else {
            format!("{stem}_{index}.csv")
        };
        let path = directory.join(name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut file) => {
                if let Err(error) = file.write_all(csv.as_bytes()).and_then(|_| file.sync_all()) {
                    drop(file);
                    let _ = fs::remove_file(&path);
                    return Err(error.to_string());
                }
                return Ok(path);
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("同名导出文件过多，请稍后重试。".into())
}

fn main() {
    tauri::Builder::default()
        .manage(StoreLock::default())
        .manage(speech::SpeechState::default())
        .invoke_handler(tauri::generate_handler![
            load_library,
            save_library,
            migrate_library,
            save_study_export,
            speech::speak_text,
            speech::stop_speech
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 Meletia");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_change_requires_a_backup() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("meletia-migration-{suffix}"));
        fs::create_dir(&directory).unwrap();
        let path = directory.join("library.json");
        let original = r#"{"version":5,"cards":[{}]}"#;
        let migrated = r#"{"version":6,"cards":[]}"#;
        fs::write(&path, original).unwrap();

        assert!(save_current_library(&path, migrated).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
        migrate_library_at(&path, original, migrated).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), migrated);
        let backup = fs::read_dir(&directory)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|item| item != &path)
            .unwrap();
        assert_eq!(fs::read_to_string(backup).unwrap(), original);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn study_exports_preserve_utf8_and_never_overwrite_existing_files() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("meletia-export-{suffix}"));
        let name = "词语状态_2026-11-08_23-00-00-000.csv";
        let csv = "\u{feff}\"词书\",\"单词\",\"掌握状态\"\r\n\"雅思\",\"contract\",\"已掌握\"\r\n";
        let first = save_study_export_at(&directory, name, csv).unwrap();
        let second = save_study_export_at(&directory, name, "第二次导出").unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read_to_string(&first).unwrap(), csv);
        assert_eq!(fs::read_to_string(&second).unwrap(), "第二次导出");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn study_exports_reject_paths_and_report_unwritable_destinations() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("meletia-export-errors-{suffix}"));
        for name in [
            "../escape.csv",
            "/tmp/escape.csv",
            "词语状态_../escape.csv",
            "词语状态_.csv",
        ] {
            assert!(save_study_export_at(&directory, name, "data").is_err());
        }
        assert!(!directory.exists());
        fs::write(&directory, "existing file").unwrap();
        assert!(save_study_export_at(&directory, "词语状态_2026-11-08.csv", "data").is_err());
        assert_eq!(fs::read_to_string(&directory).unwrap(), "existing file");
        fs::remove_file(directory).unwrap();
    }
}
