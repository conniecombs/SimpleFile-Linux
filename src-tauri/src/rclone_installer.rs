use crate::utils::hidden_command;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

// ── Versioned download URLs from downloads.rclone.org ────────────────────────
// rclone distributes pre-built zips for all major platforms and architectures.

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const DOWNLOAD_URL: &str = "https://downloads.rclone.org/rclone-current-linux-amd64.zip";

#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
const DOWNLOAD_URL: &str = "https://downloads.rclone.org/rclone-current-linux-arm64.zip";

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Directory inside the app data dir where the locally-installed rclone binary lives.
fn rclone_install_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("rclone"))
        .map_err(|e| format!("Cannot determine app data directory: {e}"))
}

/// Returns true if `rclone` can be found and launched from the system PATH.
fn rclone_in_path() -> bool {
    hidden_command("rclone")
        .arg("version")
        .output()
        .is_ok_and(|o| o.status.success())
}

/// Path to the rclone binary stored inside the app data directory, if it exists.
fn local_rclone_binary(app: &AppHandle) -> Option<PathBuf> {
    let dir = rclone_install_dir(app).ok()?;
    let bin = dir.join("rclone");
    bin.exists().then_some(bin)
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Returns the path to the rclone binary to use.
/// Priority: system PATH → app-local install.
pub fn resolve_rclone_binary(app: &AppHandle) -> Option<String> {
    if rclone_in_path() {
        return Some("rclone".to_string());
    }
    local_rclone_binary(app).map(|p| p.to_string_lossy().to_string())
}

/// Resolve the rclone binary without an `AppHandle`.
///
/// Used by `perform_*_mount` helpers that are called from contexts where the
/// handle is not conveniently available (e.g. `restore_mounts`).
///
/// Priority:
/// 1. `rclone` found on the system PATH.
/// 2. Binary installed by `SimpleFile`'s own installer, located at the
///    Tauri app-data path for the current bundle identifier.
#[allow(dead_code)]
pub(crate) fn resolve_rclone_binary_static() -> Option<String> {
    if rclone_in_path() {
        return Some("rclone".to_string());
    }

    for dir in static_rclone_dirs() {
        let bin = dir.join("rclone");
        if bin.exists() {
            return Some(bin.to_string_lossy().to_string());
        }
    }
    None
}

#[allow(dead_code)]
fn static_rclone_dirs() -> Vec<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        let Some(home) = std::env::var("HOME").ok().map(PathBuf::from) else {
            return Vec::new();
        };
        vec![
            home.join(".local/share/com.simplefile.desktop/rclone"),
            home.join(".local/share/com.simplefile.app/rclone"),
        ]
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Returns true when the `rclone` binary is available (PATH or app-local install).
#[tauri::command]
pub fn check_rclone_installed(app: AppHandle) -> bool {
    resolve_rclone_binary(&app).is_some()
}

/// Returns true when `WinFsp` is installed on Windows.
///
/// `WinFsp` is the filesystem driver/runtime used by `rclone mount` on Windows.
#[tauri::command]
pub fn check_winfsp_installed() -> bool {
    false
}

/// Downloads the rclone zip from downloads.rclone.org and extracts the binary
/// into the app data directory.  No root privileges are required.
/// Returns the path to the installed binary on success.
#[tauri::command]
pub async fn install_rclone(app: AppHandle) -> Result<String, String> {
    let install_dir = rclone_install_dir(&app)?;
    std::fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Cannot create install directory: {e}"))?;

    let bytes = download_bytes(DOWNLOAD_URL).await?;
    extract_rclone_from_zip(&bytes, &install_dir)
}

// -- WinFsp installer ----------------------------------------------------------

/// Downloads and runs the official `WinFsp` MSI installer.
#[tauri::command]
pub async fn install_winfsp() -> Result<String, String> {
    install_winfsp_impl().await
}

async fn install_winfsp_impl() -> Result<String, String> {
    Err("WinFsp is only required for cloud mounts on Windows.".to_string())
}

// -- Zip extraction ------------------------------------------------------------

/// Extract the rclone binary from the downloaded zip archive.
///
/// rclone zips always contain a single top-level directory named
/// `rclone-vX.Y.Z-{os}-{arch}/` with the binary (`rclone` or `rclone.exe`)
/// directly inside.  We locate that file by its name regardless of the
/// enclosing directory.
fn extract_rclone_from_zip(bytes: &[u8], install_dir: &Path) -> Result<String, String> {
    use std::io::Read;

    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to open zip archive: {e}"))?;

    let binary_name = "rclone";

    let dest = install_dir.join(binary_name);

    // Find the entry whose filename component is exactly `rclone` / `rclone.exe`.
    let mut found = false;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {e}"))?;

        let entry_name = entry.name().to_string();
        let file_part = std::path::Path::new(&entry_name)
            .file_name()
            .map(|f| f.to_string_lossy().to_lowercase())
            .unwrap_or_default();

        if file_part != binary_name {
            continue;
        }

        // Read the entry contents.
        let mut buf = Vec::with_capacity(entry.size() as usize);
        entry
            .read_to_end(&mut buf)
            .map_err(|e| format!("Failed to read rclone binary from zip: {e}"))?;

        std::fs::write(&dest, &buf).map_err(|e| format!("Failed to write rclone binary: {e}"))?;

        found = true;
        break;
    }

    if !found {
        return Err("Failed to locate the rclone binary inside the downloaded archive".to_string());
    }

    // Make the binary executable on Unix.
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set execute permission: {e}"))?;
    }

    Ok(dest.to_string_lossy().to_string())
}

// ── HTTP download ─────────────────────────────────────────────────────────────

async fn download_bytes(url: &str) -> Result<Vec<u8>, String> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed – server returned {}",
            response.status()
        ));
    }

    response
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("Failed to read download response: {e}"))
}
