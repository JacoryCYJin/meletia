use std::{
    fs,
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn save_study_export(
    app: AppHandle,
    filename: String,
    csv: String,
) -> Result<String, String> {
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?
        .join("Meletia");
    save_study_export_at(&directory, &filename, &csv)
        .map(|path| path.to_string_lossy().into_owned())
}

fn save_study_export_at(
    directory: &Path,
    filename: &str,
    csv: &str,
) -> Result<PathBuf, String> {
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
                if let Err(error) =
                    file.write_all(csv.as_bytes()).and_then(|_| file.sync_all())
                {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn study_exports_preserve_utf8_and_never_overwrite_existing_files() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory =
            std::env::temp_dir().join(format!("meletia-export-{suffix}"));
        let name = "词语状态_2026-11-08_23-00-00-000.csv";
        let csv = "\u{feff}\"词书\",\"单词\",\"掌握状态\"\r\n\"雅思\",\"contract\",\"已掌握\"\r\n";
        let first = save_study_export_at(&directory, name, csv).unwrap();
        let second =
            save_study_export_at(&directory, name, "第二次导出").unwrap();
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
        let directory =
            std::env::temp_dir().join(format!("meletia-export-errors-{suffix}"));
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
        assert!(
            save_study_export_at(&directory, "词语状态_2026-11-08.csv", "data")
                .is_err()
        );
        assert_eq!(fs::read_to_string(&directory).unwrap(), "existing file");
        fs::remove_file(directory).unwrap();
    }
}
