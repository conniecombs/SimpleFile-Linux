#[tauri::command]
pub async fn rclone_copy_between_remotes() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn rclone_create_folder() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn rclone_create_remote() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn rclone_delete() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn rclone_download() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn rclone_list_folder() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn rclone_list_remotes() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn rclone_mount_remote() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn rclone_move_between_remotes() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn rclone_rename() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn rclone_upload() -> Result<(), String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn github_poll_token(_client_id: String, _device_code: String) -> Result<String, String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn github_request_device_code(_client_id: String) -> Result<serde_json::Value, String> {
    Err("Not implemented on Linux-Focused branch".into())
}
