use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Deserialize)]
struct GithubDeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[tauri::command]
pub async fn github_request_device_code(client_id: String) -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id.as_str()), ("scope", "repo")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: GithubDeviceCodeResponse = res.json().await.map_err(|e| e.to_string())?;

    Ok(DeviceCodeResponse {
        device_code: json.device_code,
        user_code: json.user_code,
        verification_uri: json.verification_uri,
        expires_in: json.expires_in,
        interval: json.interval,
    })
}

#[derive(Deserialize)]
struct GithubTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub async fn github_poll_token(client_id: String, device_code: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: GithubTokenResponse = res.json().await.map_err(|e| e.to_string())?;

    if let Some(token) = json.access_token {
        Ok(token)
    } else if let Some(err) = json.error {
        Err(err)
    } else {
        Err("Unknown error".to_string())
    }
}
