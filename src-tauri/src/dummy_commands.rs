#[tauri::command]
pub async fn github_poll_token(_client_id: String, _device_code: String) -> Result<String, String> {
    Err("Not implemented on Linux-Focused branch".into())
}

#[tauri::command]
pub async fn github_request_device_code(_client_id: String) -> Result<serde_json::Value, String> {
    Err("Not implemented on Linux-Focused branch".into())
}
