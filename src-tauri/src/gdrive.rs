//! Google Drive integration: `OAuth2` authentication, file browsing,
//! segmented multi-threaded downloads, uploads, and FUSE mounting via rclone.

use futures::future::join_all;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tauri_plugin_opener::OpenerExt;
use tokio::fs::OpenOptions;
use tokio::io::{AsyncSeekExt, AsyncWriteExt, SeekFrom};

use crate::models::{GDriveAuth, GDriveEntry, MountConfig, MountInfo, ProgressUpdate};
#[cfg(unix)]
use crate::mounts::{load_configs, mount_point_for, mounts_base_dir, save_configs, stable_id};
use crate::state::AppState;

const DRIVE_API: &str = "https://www.googleapis.com/drive/v3";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v3/userinfo";
const FOLDER_MIME: &str = "application/vnd.google-apps.folder";
const GDOC_PREFIX: &str = "application/vnd.google-apps.";
const ENV_GOOGLE_CLIENT_ID: &str = "SIMPLEFILE_GOOGLE_CLIENT_ID";

// ── Internal helpers ──────────────────────────────────────────────────────────

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))
}

fn optional_non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn configured_google_client_id() -> Option<String> {
    std::env::var(ENV_GOOGLE_CLIENT_ID)
        .ok()
        .and_then(|value| optional_non_empty(Some(value)))
        .or_else(|| {
            option_env!("SIMPLEFILE_GOOGLE_CLIENT_ID")
                .and_then(|value| optional_non_empty(Some(value.to_string())))
        })
}

fn resolve_google_client_id(client_id: Option<String>) -> Result<String, String> {
    optional_non_empty(client_id)
        .or_else(configured_google_client_id)
        .ok_or_else(|| {
            "Legacy Google Drive OAuth is unavailable in this build. Use the rclone-backed Google Drive sign-in from Remote Drives.".to_string()
        })
}

fn random_url_token(byte_count: usize) -> Result<String, String> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};

    let mut bytes = vec![0u8; byte_count];
    getrandom::fill(&mut bytes).map_err(|e| format!("Random generation failed: {e}"))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn create_pkce_pair() -> Result<(String, String), String> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use sha2::{Digest, Sha256};

    let verifier = random_url_token(64)?;
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());
    Ok((verifier, challenge))
}

fn callback_query_param(request: &str, key: &str) -> Option<String> {
    let path = request.lines().next()?.split_whitespace().nth(1)?;
    let url = reqwest::Url::parse(&format!("http://localhost{path}")).ok()?;
    url.query_pairs()
        .find(|(param, _)| param.as_ref() == key)
        .map(|(_, value)| value.into_owned())
}

fn google_auth_url(
    client_id: &str,
    redirect_uri: &str,
    scope: &str,
    state: &str,
    code_challenge: &str,
    login_hint: Option<&str>,
) -> Result<String, String> {
    let mut url = reqwest::Url::parse(AUTH_URL).map_err(|e| format!("Auth URL error: {e}"))?;
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("client_id", client_id)
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", scope)
            .append_pair("access_type", "offline")
            .append_pair("prompt", "consent")
            .append_pair("state", state)
            .append_pair("code_challenge", code_challenge)
            .append_pair("code_challenge_method", "S256");

        if let Some(login_hint) = login_hint {
            query.append_pair("login_hint", login_hint);
        }
    }
    Ok(url.to_string())
}

/// Exchange an `OAuth2` authorization code for access + refresh tokens, then
/// fetch the user's email address.
async fn exchange_code(
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<GDriveAuth, String> {
    let http = build_client()?;

    let mut params = vec![
        ("client_id", client_id.to_string()),
        ("code", code.to_string()),
        ("redirect_uri", redirect_uri.to_string()),
        ("grant_type", "authorization_code".to_string()),
        ("code_verifier", code_verifier.to_string()),
    ];

    if let Some(client_secret) = client_secret {
        params.push(("client_secret", client_secret.to_string()));
    }

    let text = http
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Read token response failed: {e}"))?;

    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Token JSON parse error: {e}"))?;

    if let Some(err) = v.get("error") {
        return Err(format!(
            "OAuth2 error: {} — {}",
            err.as_str().unwrap_or("unknown"),
            v["error_description"].as_str().unwrap_or("")
        ));
    }

    let access_token = v["access_token"]
        .as_str()
        .ok_or("Missing access_token")?
        .to_string();
    let refresh_token = v["refresh_token"].as_str().unwrap_or("").to_string();
    let expires_in = v["expires_in"].as_u64().unwrap_or(3600);
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        + expires_in;

    // Fetch user email.
    let info_text = http
        .get(USERINFO_URL)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Userinfo request failed: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Read userinfo response failed: {e}"))?;

    let info: serde_json::Value =
        serde_json::from_str(&info_text).map_err(|e| format!("Userinfo JSON parse error: {e}"))?;
    let email = info["email"].as_str().unwrap_or("unknown").to_string();

    Ok(GDriveAuth {
        access_token,
        refresh_token,
        expires_at,
        email,
        client_id: client_id.to_string(),
        client_secret: client_secret.unwrap_or_default().to_string(),
    })
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Start the `OAuth2` authorization flow.
///
/// Binds a local TCP server on `127.0.0.1:9876` (falls back to 9877–9879)
/// to receive the redirect callback from Google. Opens the authorization URL
/// in the system browser, then returns that URL for diagnostics. Emits the
/// `gdrive-auth-complete` event on success, or `gdrive-auth-error` on failure.
#[tauri::command]
pub async fn gdrive_start_auth(
    client_id: Option<String>,
    client_secret: Option<String>,
    login_hint: Option<String>,
    app: tauri::AppHandle,
    db: tauri::State<'_, crate::db::DbState>,
) -> Result<String, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt as _};
    use tokio::net::TcpListener;
    use tokio::sync::oneshot;

    let db_client_id =
        crate::db::get_db_setting(db.clone(), "google_client_id".to_string())?.unwrap_or_default();
    let db_client_secret =
        crate::db::get_db_setting(db, "google_client_secret".to_string())?.unwrap_or_default();

    let stored_client_id = optional_non_empty(Some(db_client_id));
    let stored_client_secret = optional_non_empty(Some(db_client_secret));

    let client_id = resolve_google_client_id(client_id.or(stored_client_id))?;
    let client_secret = optional_non_empty(client_secret).or(stored_client_secret);
    let login_hint = optional_non_empty(login_hint);

    // Find a free port.
    let mut port = 9876u16;
    let listener = loop {
        if let Ok(l) = TcpListener::bind(format!("127.0.0.1:{port}")).await {
            break l;
        } else {
            port += 1;
            if port > 9880 {
                return Err("Could not bind to any port in 9876–9880".to_string());
            }
        }
    };

    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let scope = "https://www.googleapis.com/auth/drive \
                 https://www.googleapis.com/auth/userinfo.email";
    let state = random_url_token(24)?;
    let (code_verifier, code_challenge) = create_pkce_pair()?;
    let auth_url = google_auth_url(
        &client_id,
        &redirect_uri,
        scope,
        &state,
        &code_challenge,
        login_hint.as_deref(),
    )?;

    // Spawn background task — waits for the OAuth callback.
    let client_id_clone = client_id.clone();
    let client_secret_clone = client_secret.clone();
    let redirect_uri_clone = redirect_uri.clone();
    let state_clone = state.clone();
    let code_verifier_clone = code_verifier.clone();
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let app_for_task = app.clone();
    tokio::spawn(async move {
        let result: Result<(), String> = async {
            // Accept exactly one connection (the browser redirect).
            let (mut stream, _) = tokio::select! {
                _ = cancel_rx => return Ok(()),
                result = listener.accept() => result.map_err(|e| format!("Accept failed: {e}"))?,
            };

            let mut buf = vec![0u8; 8192];
            let n = stream
                .read(&mut buf)
                .await
                .map_err(|e| format!("Read failed: {e}"))?;
            let request = String::from_utf8_lossy(&buf[..n]).to_string();

            // Send a success page back to the browser.
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
                <html><body style='font-family:sans-serif;text-align:center;padding:40px'>\
                <h2>Authorization successful!</h2>\
                <p>You can close this browser tab and return to SimpleFile.</p>\
                </body></html>";
            let _ = stream.write_all(response.as_bytes()).await;
            drop(stream);

            if let Some(error) = callback_query_param(&request, "error") {
                let description =
                    callback_query_param(&request, "error_description").unwrap_or_default();
                return Err(format!("Google OAuth error: {error} {description}")
                    .trim()
                    .to_string());
            }

            let returned_state = callback_query_param(&request, "state")
                .ok_or_else(|| "Missing OAuth state in callback".to_string())?;
            if returned_state != state_clone {
                return Err("OAuth state mismatch in Google callback".to_string());
            }

            // Parse the authorization code from the GET request line.
            let code = callback_query_param(&request, "code")
                .ok_or_else(|| "No authorization code found in callback".to_string())?;

            // Exchange the code for tokens.
            let auth = exchange_code(
                &client_id_clone,
                client_secret_clone.as_deref(),
                &code,
                &redirect_uri_clone,
                &code_verifier_clone,
            )
            .await?;

            let _ = app_for_task.emit("gdrive-auth-complete", &auth);
            Ok(())
        }
        .await;

        if let Err(e) = result {
            let _ = app_for_task.emit("gdrive-auth-error", e);
        }
    });

    if let Err(error) = app.opener().open_url(auth_url.as_str(), None::<&str>) {
        let _ = cancel_tx.send(());
        return Err(format!("Failed to open browser: {error}"));
    }

    Ok(auth_url)
}

/// Refresh an expired access token using the stored refresh token.
#[tauri::command]
pub async fn gdrive_refresh_token(
    client_id: String,
    client_secret: String,
    refresh_token: String,
) -> Result<GDriveAuth, String> {
    let http = build_client()?;

    let mut params = vec![
        ("client_id", client_id.clone()),
        ("refresh_token", refresh_token.clone()),
        ("grant_type", "refresh_token".to_string()),
    ];
    if !client_secret.trim().is_empty() {
        params.push(("client_secret", client_secret.clone()));
    }

    let text = http
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Refresh token request failed: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Read refresh response failed: {e}"))?;

    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Refresh JSON parse error: {e}"))?;

    if let Some(err) = v.get("error") {
        return Err(format!(
            "Token refresh error: {}",
            err.as_str().unwrap_or("unknown")
        ));
    }

    let access_token = v["access_token"]
        .as_str()
        .ok_or("Missing access_token in refresh response")?
        .to_string();
    let expires_in = v["expires_in"].as_u64().unwrap_or(3600);
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        + expires_in;

    // Fetch current email.
    let http2 = build_client()?;
    let info_text = http2
        .get(USERINFO_URL)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Userinfo request failed: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Read userinfo response failed: {e}"))?;

    let info: serde_json::Value = serde_json::from_str(&info_text).unwrap_or(serde_json::json!({}));
    let email = info["email"].as_str().unwrap_or("unknown").to_string();

    Ok(GDriveAuth {
        access_token,
        refresh_token,
        expires_at,
        email,
        client_id,
        client_secret,
    })
}

/// List files in a Google Drive folder.
///
/// Pass `folder_id = "root"` for the Drive root.
#[tauri::command]
pub async fn gdrive_list_folder(
    access_token: String,
    folder_id: String,
) -> Result<Vec<GDriveEntry>, String> {
    let http = build_client()?;

    let query = format!("'{folder_id}' in parents and trashed = false");
    let fields = "files(id,name,mimeType,size,modifiedTime)";

    let text = http
        .get(format!("{DRIVE_API}/files"))
        .bearer_auth(&access_token)
        .query(&[
            ("q", query.as_str()),
            ("fields", fields),
            ("pageSize", "200"),
            ("orderBy", "folder,name"),
        ])
        .send()
        .await
        .map_err(|e| format!("List folder request failed: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Read list folder response failed: {e}"))?;

    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {e}"))?;

    if let Some(err) = v.get("error") {
        return Err(format!(
            "Drive API error: {}",
            err["message"].as_str().unwrap_or("unknown")
        ));
    }

    let files = v["files"].as_array().ok_or("Missing files array")?;
    let entries = files
        .iter()
        .map(|f| {
            let mime = f["mimeType"].as_str().unwrap_or("").to_string();
            let is_folder = mime == FOLDER_MIME;
            let is_google_doc = !is_folder && mime.starts_with(GDOC_PREFIX);
            GDriveEntry {
                id: f["id"].as_str().unwrap_or("").to_string(),
                name: f["name"].as_str().unwrap_or("").to_string(),
                mime_type: mime,
                size: f["size"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0),
                modified: f["modifiedTime"].as_str().unwrap_or("").to_string(),
                is_folder,
                is_google_doc,
            }
        })
        .collect();

    Ok(entries)
}

/// Download a Google Drive file with segmented multi-threaded transfers.
///
/// Google Workspace files (`is_google_doc` = true) are exported as PDF instead.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn gdrive_download_segmented(
    access_token: String,
    file_id: String,
    file_size: u64,
    local_path: String,
    is_google_doc: bool,
    thread_count: u64,
    operation_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Google Workspace files cannot be downloaded with Range; export as PDF.
    if is_google_doc {
        let http = build_client()?;
        let bytes = http
            .get(format!("{DRIVE_API}/files/{file_id}/export"))
            .bearer_auth(&access_token)
            .query(&[("mimeType", "application/pdf")])
            .send()
            .await
            .map_err(|e| format!("Export request failed: {e}"))?
            .bytes()
            .await
            .map_err(|e| format!("Read export body failed: {e}"))?;

        tokio::fs::write(&local_path, &bytes)
            .await
            .map_err(|e| format!("Write failed: {e}"))?;

        let _ = app.emit(
            "operation-progress",
            ProgressUpdate {
                operation_id,
                operation_type: "gdrive-download".to_string(),
                current: bytes.len() as u64,
                total: bytes.len() as u64,
                current_item: local_path,
                status: "completed".to_string(),
                error: None,
            },
        );
        return Ok(());
    }

    if file_size == 0 {
        tokio::fs::File::create(&local_path)
            .await
            .map_err(|e| format!("Cannot create local file: {e}"))?;
        let _ = app.emit(
            "operation-progress",
            ProgressUpdate {
                operation_id,
                operation_type: "gdrive-download".to_string(),
                current: 0,
                total: 0,
                current_item: local_path,
                status: "completed".to_string(),
                error: None,
            },
        );
        return Ok(());
    }

    // Pre-allocate local file.
    {
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&local_path)
            .await
            .map_err(|e| format!("Cannot open local file: {e}"))?;
        file.set_len(file_size)
            .await
            .map_err(|e| format!("Cannot pre-allocate file: {e}"))?;
    }

    let threads = thread_count.clamp(1, 16).min(file_size);
    let chunk_size = file_size / threads;
    let file_id_arc = Arc::new(file_id);
    let token_arc = Arc::new(access_token);
    let local_path_arc = Arc::new(local_path.clone());
    let bytes_done = Arc::new(AtomicU64::new(0));

    let mut tasks = vec![];

    for i in 0..threads {
        let file_id_clone = file_id_arc.clone();
        let token_clone = token_arc.clone();
        let local_clone = local_path_arc.clone();
        let counter = bytes_done.clone();
        let app_clone = app.clone();
        let op_id = operation_id.clone();

        let start = i * chunk_size;
        let end = if i == threads - 1 {
            file_size
        } else {
            (i + 1) * chunk_size
        };
        let segment_size = end - start;

        let task = tokio::spawn(async move {
            let http = reqwest::Client::builder()
                .build()
                .map_err(|e| format!("HTTP client error: {e}"))?;

            let range_header = format!("bytes={}-{}", start, end - 1);
            let mut response = http
                .get(format!("{DRIVE_API}/files/{file_id_clone}?alt=media"))
                .bearer_auth(token_clone.as_str())
                .header("Range", range_header)
                .send()
                .await
                .map_err(|e| format!("Segment {i} download failed: {e}"))?;

            let mut file = OpenOptions::new()
                .write(true)
                .open(&*local_clone)
                .await
                .map_err(|e| format!("Cannot open file for segment {i}: {e}"))?;

            file.seek(SeekFrom::Start(start))
                .await
                .map_err(|e| format!("Seek failed for segment {i}: {e}"))?;

            let mut written = 0u64;
            let mut last_report = std::time::Instant::now();

            while written < segment_size {
                let chunk = response
                    .chunk()
                    .await
                    .map_err(|e| format!("Chunk error in segment {i}: {e}"))?;
                match chunk {
                    None => break,
                    Some(bytes) => {
                        let to_write = (bytes.len() as u64).min(segment_size - written) as usize;
                        file.write_all(&bytes[..to_write])
                            .await
                            .map_err(|e| format!("Write error in segment {i}: {e}"))?;
                        written += to_write as u64;

                        let total_done =
                            counter.fetch_add(to_write as u64, Ordering::Relaxed) + to_write as u64;

                        let now = std::time::Instant::now();
                        if now.duration_since(last_report).as_millis() >= 250 {
                            last_report = now;
                            let _ = app_clone.emit(
                                "operation-progress",
                                ProgressUpdate {
                                    operation_id: op_id.clone(),
                                    operation_type: "gdrive-download".to_string(),
                                    current: total_done,
                                    total: file_size,
                                    current_item: local_clone.to_string(),
                                    status: "running".to_string(),
                                    error: None,
                                },
                            );
                        }
                    }
                }
            }

            Ok::<(), String>(())
        });

        tasks.push(task);
    }

    let results = join_all(tasks).await;
    for res in results {
        match res {
            Ok(Ok(())) => continue,
            Ok(Err(e)) => return Err(format!("Download segment failed: {e}")),
            Err(e) => return Err(format!("Task join error: {e}")),
        }
    }

    let _ = app.emit(
        "operation-progress",
        ProgressUpdate {
            operation_id,
            operation_type: "gdrive-download".to_string(),
            current: file_size,
            total: file_size,
            current_item: local_path,
            status: "completed".to_string(),
            error: None,
        },
    );

    Ok(())
}

/// Upload a local file to a Google Drive folder using multipart upload.
#[tauri::command]
pub async fn gdrive_upload(
    access_token: String,
    parent_id: String,
    local_path: String,
    operation_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let file_name = std::path::Path::new(&local_path)
        .file_name()
        .ok_or("Invalid local path")?
        .to_string_lossy()
        .to_string();

    let bytes = tokio::fs::read(&local_path)
        .await
        .map_err(|e| format!("Cannot read file: {e}"))?;
    let total = bytes.len() as u64;

    let _ = app.emit(
        "operation-progress",
        ProgressUpdate {
            operation_id: operation_id.clone(),
            operation_type: "gdrive-upload".to_string(),
            current: 0,
            total,
            current_item: file_name.clone(),
            status: "running".to_string(),
            error: None,
        },
    );

    // Build multipart body manually to avoid needing the multipart reqwest feature.
    let boundary = "simplefile-boundary-xq9k";
    let metadata = serde_json::json!({
        "name": file_name,
        "parents": [parent_id]
    })
    .to_string();

    let mut body: Vec<u8> = Vec::new();
    body.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata}\r\n\
             --{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(&bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--").as_bytes());

    let content_type = format!("multipart/related; boundary={boundary}");

    let http = build_client()?;
    let resp = http
        .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
        .bearer_auth(&access_token)
        .header("Content-Type", content_type)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Upload request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("Upload failed (HTTP {status}): {err_body}"));
    }

    let _ = app.emit(
        "operation-progress",
        ProgressUpdate {
            operation_id,
            operation_type: "gdrive-upload".to_string(),
            current: total,
            total,
            current_item: file_name,
            status: "completed".to_string(),
            error: None,
        },
    );

    Ok(())
}

/// Create a new folder inside `parent_id`.  Returns the new folder's Drive ID.
#[tauri::command]
pub async fn gdrive_create_folder(
    access_token: String,
    parent_id: String,
    name: String,
) -> Result<String, String> {
    let http = build_client()?;

    let body = serde_json::json!({
        "name": name,
        "mimeType": FOLDER_MIME,
        "parents": [parent_id]
    })
    .to_string();

    let resp = http
        .post(format!("{DRIVE_API}/files"))
        .bearer_auth(&access_token)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Create folder request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Err(format!("Create folder failed (HTTP {status}): {err}"));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| format!("Read response failed: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {e}"))?;

    Ok(v["id"].as_str().unwrap_or("").to_string())
}

/// Move a file or folder to the Drive trash.
#[tauri::command]
pub async fn gdrive_delete(access_token: String, file_id: String) -> Result<(), String> {
    let http = build_client()?;

    let resp = http
        .delete(format!("{DRIVE_API}/files/{file_id}"))
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Delete request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Err(format!("Delete failed (HTTP {status}): {err}"));
    }

    Ok(())
}

/// Rename a file or folder in Google Drive.
#[tauri::command]
pub async fn gdrive_rename(
    access_token: String,
    file_id: String,
    new_name: String,
) -> Result<(), String> {
    let http = build_client()?;

    let body = serde_json::json!({ "name": new_name }).to_string();

    let resp = http
        .patch(format!("{DRIVE_API}/files/{file_id}"))
        .bearer_auth(&access_token)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Rename request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Err(format!("Rename failed (HTTP {status}): {err}"));
    }

    Ok(())
}

// ── FUSE mounting via rclone ──────────────────────────────────────────────────

/// Write an rclone config and spawn `rclone mount` for Google Drive.
///
/// `config` fields:
/// - `client_id`   — Google `OAuth2` client ID
/// - `client_secret` — Google `OAuth2` client secret
/// - `token_json`  — full `OAuth2` token JSON (`access_token`, `refresh_token`, expiry)
#[cfg(unix)]
pub(crate) fn perform_gdrive_mount(config: &MountConfig, mount_point: &str) -> Result<u32, String> {
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;
    use std::process::Command;

    let id = &config.id;
    let client_id = config.client_id.as_deref().unwrap_or("");
    let client_secret = config.client_secret.as_deref().unwrap_or("");
    let token_json = config.token_json.as_deref().unwrap_or("{}");

    let conf_dir = mounts_base_dir();
    std::fs::create_dir_all(&conf_dir)
        .map_err(|e| format!("Cannot create mounts directory: {e}"))?;

    let conf_path = conf_dir.join(format!("{id}.rclone.conf"));
    let conf_content = format!(
        "[gdrive_{id}]\n\
         type = drive\n\
         client_id = {client_id}\n\
         client_secret = {client_secret}\n\
         token = {token_json}\n\
         scope = drive\n",
    );

    {
        let mut f = std::fs::File::create(&conf_path)
            .map_err(|e| format!("Cannot create rclone config: {e}"))?;
        f.write_all(conf_content.as_bytes())
            .map_err(|e| format!("Cannot write rclone config: {e}"))?;
    }
    let _ = std::fs::set_permissions(&conf_path, std::fs::Permissions::from_mode(0o600));

    std::fs::create_dir_all(mount_point).map_err(|e| format!("Cannot create mount point: {e}"))?;

    // Resolve the rclone binary — prefer system PATH, fall back to app-local install.
    let rclone_bin = crate::rclone_installer::resolve_rclone_binary_static().ok_or_else(|| {
        "rclone is not installed. Please install it from Settings → Cloud Tools.".to_string()
    })?;

    let child = Command::new(&rclone_bin)
        .args([
            "mount",
            &format!("gdrive_{id}:"),
            mount_point,
            "--config",
            conf_path.to_str().unwrap_or(""),
            "--vfs-cache-mode",
            "full",
            "--daemon",
        ])
        .spawn()
        .map_err(|e| format!("Failed to start rclone: {e}"))?;

    Ok(child.id())
}

/// Non-Unix stub — call site is gated #[cfg(unix)], so this is unreachable
/// but kept for completeness.
#[cfg(not(unix))]
#[allow(dead_code)]
pub(crate) fn perform_gdrive_mount(
    _config: &MountConfig,
    _mount_point: &str,
) -> Result<u32, String> {
    Err("Google Drive FUSE mounting is not supported on this platform.".to_string())
}

/// Tauri command: authenticate and mount Google Drive via rclone.
///
/// Accepts a pre-obtained `GDriveAuth` (from `gdrive_start_auth`).
#[tauri::command]
pub async fn mount_gdrive(
    auth: GDriveAuth,
    name: String,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<MountInfo, String> {
    #[cfg(not(unix))]
    {
        let _ = (auth, name, state);
        Err("Google Drive FUSE mounting is not supported on this platform.".to_string())
    }

    #[cfg(unix)]
    {
        let id = stable_id("gdrive", &auth.email);
        let mount_point = mount_point_for(&id);

        // Build the rclone-compatible token JSON.
        let now_iso = chrono::Utc::now()
            + chrono::Duration::seconds(
                auth.expires_at.saturating_sub(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs(),
                ) as i64,
            );
        let token_json = serde_json::json!({
            "access_token": auth.access_token,
            "token_type": "Bearer",
            "refresh_token": auth.refresh_token,
            "expiry": now_iso.to_rfc3339(),
        })
        .to_string();

        let config = MountConfig {
            id: id.clone(),
            mount_type: "gdrive".to_string(),
            name: name.clone(),
            mount_point: Some(mount_point.clone()),
            host: None,
            port: None,
            user: Some(auth.email.clone()),
            pass: None,
            url: None,
            client_id: Some(auth.client_id.clone()),
            client_secret: Some(auth.client_secret.clone()),
            token_json: Some(token_json),
        };

        let pid = perform_gdrive_mount(&config, &mount_point)?;

        {
            let mut pids = state.mount_pids.lock();
            pids.insert(mount_point.clone(), pid);
        }

        let info = MountInfo {
            id: id.clone(),
            mount_type: "gdrive".to_string(),
            remote: format!("gdrive://{}", auth.email),
            mount_point: mount_point.clone(),
            name,
        };

        {
            let mut mounts = state.mounts.lock();
            mounts.retain(|m| m.id != id);
            mounts.push(info.clone());
        }

        let mut configs = load_configs();
        configs.retain(|c| c.id != id);
        configs.push(config);
        save_configs(&configs)?;

        Ok(info)
    }
}
