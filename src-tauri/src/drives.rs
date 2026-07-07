use crate::models::DriveInfo;

/// Get total and free space for a path on Unix systems using statvfs
#[cfg(unix)]
fn get_unix_disk_space(path: &str) -> (u64, u64) {
    use std::ffi::CString;
    let c_path = match CString::new(path) {
        Ok(p) => p,
        Err(_) => return (0, 0),
    };
    unsafe {
        let mut stat: libc::statvfs = std::mem::zeroed();
        if libc::statvfs(c_path.as_ptr(), &raw mut stat) == 0 {
            let total = stat.f_blocks as u64 * stat.f_frsize as u64;
            let free = stat.f_bavail as u64 * stat.f_frsize as u64;
            (total, free)
        } else {
            (0, 0)
        }
    }
}

#[tauri::command]
pub async fn list_drives() -> Result<Vec<DriveInfo>, String> {
    tauri::async_runtime::spawn_blocking(list_drives_blocking)
        .await
        .map_err(|e| format!("Drive enumeration task failed: {e}"))?
}

fn list_drives_blocking() -> Result<Vec<DriveInfo>, String> {
    let mut drives = Vec::new();

    // Only add root-level mounts directly; /mnt and /media are scanner
    // directories whose *subdirectories* are the actual mount points.
    let mount_points = vec!["/", "/home"];
    for mount in mount_points {
        let path = std::path::Path::new(mount);
        if path.exists() {
            let (total_space, free_space) = get_unix_disk_space(mount);
            drives.push(DriveInfo {
                name: mount.to_string(),
                path: mount.to_string(),
                drive_type: "Mount".to_string(),
                total_space,
                free_space,
            });
        }
    }
    // Scan /mnt, /media, and /run/media/$USER for mounted drives
    let mut scan_dirs: Vec<String> = vec!["/mnt".to_string(), "/media".to_string()];
    // Add /run/media/$USER if it exists (modern udisks2 mount point)
    if let Ok(home) = std::env::var("HOME") {
        if let Some(user) = std::path::Path::new(&home).file_name() {
            let run_media = format!("/run/media/{}", user.to_string_lossy());
            if std::path::Path::new(&run_media).exists() {
                scan_dirs.push(run_media);
            }
        }
    }
    for base in &scan_dirs {
        if let Ok(entries) = std::fs::read_dir(base) {
            for entry in entries.flatten() {
                let path: std::path::PathBuf = entry.path();
                if path.is_dir() {
                    if let Some(name) = path.file_name() {
                        let path_str = path.to_string_lossy().to_string();
                        let (total_space, free_space) = get_unix_disk_space(&path_str);
                        drives.push(DriveInfo {
                            name: name.to_string_lossy().to_string(),
                            path: path_str,
                            drive_type: "Mount".to_string(),
                            total_space,
                            free_space,
                        });
                    }
                }
            }
        }
    }
    Ok(drives)
}
