use crate::models::SmartFolder;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn get_smart_folders_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("smart_folders.json"))
        .map_err(|e| format!("Failed to get app data dir: {e}"))
}

#[tauri::command]
pub fn load_smart_folders(app: AppHandle) -> Result<Vec<SmartFolder>, String> {
    let path = get_smart_folders_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let folders: Vec<SmartFolder> = serde_json::from_str(&content).unwrap_or_else(|_| Vec::new());
    Ok(folders)
}

#[tauri::command]
pub fn save_smart_folder(folder: SmartFolder, app: AppHandle) -> Result<Vec<SmartFolder>, String> {
    let mut folders = load_smart_folders(app.clone())?;

    // Check if it already exists and update
    let mut updated = false;
    for f in &mut folders {
        if f.id == folder.id {
            *f = folder.clone();
            updated = true;
            break;
        }
    }

    if !updated {
        folders.push(folder);
    }

    let path = get_smart_folders_path(&app)?;

    // Ensure parent dir exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create smart-folder directory {}: {e}",
                parent.display()
            )
        })?;
    }

    let content = serde_json::to_string_pretty(&folders).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;

    Ok(folders)
}

#[tauri::command]
pub fn delete_smart_folder(id: String, app: AppHandle) -> Result<Vec<SmartFolder>, String> {
    let mut folders = load_smart_folders(app.clone())?;
    folders.retain(|f| f.id != id);

    let path = get_smart_folders_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create smart-folder directory {}: {e}",
                parent.display()
            )
        })?;
    }
    let content = serde_json::to_string_pretty(&folders).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;

    Ok(folders)
}
