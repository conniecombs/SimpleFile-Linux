use crate::models::{DirectoryListing, FileEntry, TreeNode};

use crate::state::AppState;
use crate::utils::{
    count_directory_entries, count_items_scoped, dirs_home, get_file_entry,
    validate_existing_path_no_resolve, validate_name, validate_path_no_follow,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{atomic::Ordering, Arc};
use tauri_plugin_dialog::DialogExt;

// ============================================================================
// Basic File Commands
// ============================================================================

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs_home()
}

#[derive(Serialize)]
pub struct XdgDirs {
    pub desktop: Option<String>,
    pub documents: Option<String>,
    pub downloads: Option<String>,
    pub music: Option<String>,
    pub pictures: Option<String>,
    pub videos: Option<String>,
}

#[tauri::command]
pub fn get_xdg_dirs() -> Result<XdgDirs, String> {
    if let Some(user_dirs) = directories::UserDirs::new() {
        Ok(XdgDirs {
            desktop: user_dirs
                .desktop_dir()
                .map(|p| p.to_string_lossy().into_owned()),
            documents: user_dirs
                .document_dir()
                .map(|p| p.to_string_lossy().into_owned()),
            downloads: user_dirs
                .download_dir()
                .map(|p| p.to_string_lossy().into_owned()),
            music: user_dirs
                .audio_dir()
                .map(|p| p.to_string_lossy().into_owned()),
            pictures: user_dirs
                .picture_dir()
                .map(|p| p.to_string_lossy().into_owned()),
            videos: user_dirs
                .video_dir()
                .map(|p| p.to_string_lossy().into_owned()),
        })
    } else {
        Err("Failed to determine user directories".into())
    }
}

#[tauri::command]
pub async fn select_directory(
    default_path: Option<String>,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_title("Select Start Location");

        if let Some(path) = default_path {
            let trimmed = path.trim();
            if !trimmed.is_empty() {
                let path_buf = PathBuf::from(trimmed);
                if path_buf.is_dir() {
                    dialog = dialog.set_directory(path_buf);
                }
            }
        }

        Ok(dialog
            .blocking_pick_folder()
            .and_then(|folder| folder.into_path().ok())
            .map(|path| path.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| format!("Directory picker task failed: {e}"))?
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<DirectoryListing, String> {
    if let Some(listing) = crate::archive::list_archive_directory(&path)? {
        return Ok(listing);
    }

    let path_buf = validate_existing_path_no_resolve(&path)?;
    if !path_buf.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }

    let current_path = path_buf.to_string_lossy().to_string();
    let parent = path_buf.parent().map(|p| p.to_string_lossy().to_string());
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<FileEntry>, String> {
        let mut entries: Vec<FileEntry> = Vec::new();
        let read_dir =
            fs::read_dir(&path_buf).map_err(|e| format!("Failed to read directory: {e}"))?;

        for entry in read_dir.flatten() {
            if let Some(file_entry) = get_file_entry(&entry.path()) {
                entries.push(file_entry);
            }
        }

        entries.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));

        Ok(entries)
    })
    .await
    .map_err(|e| format!("Directory listing task panicked: {e}"))??;

    Ok(DirectoryListing {
        path: current_path,
        parent,
        entries,
    })
}

#[tauri::command]
pub fn create_directory(path: String, name: String) -> Result<String, String> {
    if crate::archive::split_archive_path(&path)?.is_some() {
        return crate::archive::create_archive_directory(path, name, None);
    }

    validate_name(&name)?;
    let parent = validate_existing_path_no_resolve(&path)?;
    let new_path = parent.join(&name);
    fs::create_dir(&new_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            format!("Directory already exists: {name}")
        } else {
            format!("Failed to create directory: {e}")
        }
    })?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_file(path: String, name: String) -> Result<String, String> {
    if crate::archive::split_archive_path(&path)?.is_some() {
        return crate::archive::create_archive_file(path, name, None);
    }

    validate_name(&name)?;
    let parent = validate_existing_path_no_resolve(&path)?;
    let new_path = parent.join(&name);
    // Use create_new to atomically check existence + create, avoiding TOCTOU race
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&new_path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                format!("File already exists: {name}")
            } else {
                format!("Failed to create file: {e}")
            }
        })?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_entry(path: String, app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if crate::archive::is_archive_virtual_path(&path) {
            return crate::archive::delete_archive_entry(&path, Some(&app));
        }

        // Use lstat-based validation so we operate on the symlink itself, not its
        // target.  validate_existing_path would canonicalise the path and cause
        // remove_dir_all to wipe the *target* directory instead of just unlinking
        // the symlink shortcut.
        let path_buf = validate_path_no_follow(&path)?;
        let lstat =
            fs::symlink_metadata(&path_buf).map_err(|e| format!("Failed to stat path: {e}"))?;
        if lstat.file_type().is_symlink() {
            // Always unlink a symlink without recursing into its target.
            fs::remove_file(&path_buf).map_err(|e| format!("Failed to delete symlink: {e}"))?;
        } else if lstat.is_dir() {
            fs::remove_dir_all(&path_buf)
                .map_err(|e| format!("Failed to delete directory: {e}"))?;
        } else {
            fs::remove_file(&path_buf).map_err(|e| format!("Failed to delete file: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
}

#[tauri::command]
pub fn move_to_trash(paths: Vec<String>, app: tauri::AppHandle) -> Result<(), String> {
    for path in &paths {
        if crate::archive::is_archive_virtual_path(path) {
            crate::archive::delete_archive_entry(path, Some(&app))?;
            continue;
        }
        let validated = validate_path_no_follow(path)?;
        trash::delete(&validated).map_err(|e| format!("TRASH_UNAVAILABLE: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_entry(path: String, new_name: String) -> Result<String, String> {
    if crate::archive::is_archive_virtual_path(&path) {
        return crate::archive::rename_archive_entry(path, new_name, None);
    }

    validate_name(&new_name)?;
    // Use lstat so we rename the symlink itself, not its resolved target.
    let path_buf = validate_path_no_follow(&path)?;
    let parent = path_buf
        .parent()
        .ok_or_else(|| "Cannot get parent directory".to_string())?;
    let new_path = parent.join(&new_name);
    if new_path == path_buf {
        return Ok(new_path.to_string_lossy().to_string());
    }

    let same_target_on_case_insensitive_fs =
        path_collision_key(&path_buf) == path_collision_key(&new_path);
    if new_path.exists() && !same_target_on_case_insensitive_fs {
        return Err(format!(
            "A file or directory with that name already exists: {new_name}"
        ));
    }

    // Case-only rename on case-insensitive filesystems can look like a
    // destination conflict because the final path already resolves to the
    // source itself. Use a temporary intermediate name to make the operation
    // explicit and reliable.
    if same_target_on_case_insensitive_fs && new_path.exists() {
        let temp_path = move_to_unique_rename_temp(&path_buf, parent, 0)?;
        if let Err(e) = rename_no_replace(&temp_path, &new_path) {
            let _ = fs::rename(&temp_path, &path_buf);
            return Err(format!("Failed to rename: {e}"));
        }
    } else {
        fs::rename(&path_buf, &new_path).map_err(|e| format!("Failed to rename: {e}"))?;
    }
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn chmod_file(path: String, mode: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let path_buf = validate_existing_path_no_resolve(&path)?;
        let mut perms = fs::metadata(&path_buf)
            .map_err(|e| format!("Failed to read metadata: {e}"))?
            .permissions();
        perms.set_mode(mode);
        fs::set_permissions(&path_buf, perms)
            .map_err(|e| format!("Failed to set permissions: {e}"))?;
        Ok(())
    }
    #[cfg(not(unix))]
    {
        let _ = (path, mode);
        Err("chmod is only supported on Unix systems".to_string())
    }
}

#[tauri::command]
pub fn chown_file(path: String, uid: u32, gid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        let path_buf = validate_existing_path_no_resolve(&path)?;
        let c_path = std::ffi::CString::new(path_buf.as_os_str().as_bytes())
            .map_err(|_| "Invalid path".to_string())?;
        unsafe {
            if libc::chown(c_path.as_ptr(), uid as libc::uid_t, gid as libc::gid_t) != 0 {
                let err = std::io::Error::last_os_error();
                return Err(format!("Failed to change ownership: {err}"));
            }
        }
        Ok(())
    }
    #[cfg(not(unix))]
    {
        let _ = (path, uid, gid);
        Err("chown is only supported on Unix systems".to_string())
    }
}

#[derive(Debug, Deserialize)]
pub struct RenameRequest {
    pub path: String,
    pub new_name: String,
}

#[derive(Debug)]
struct RenamePlan {
    source_path: PathBuf,
    temp_path: Option<PathBuf>,
    final_path: PathBuf,
}

fn path_collision_key(path: &Path) -> String {
    let s = path.to_string_lossy().to_string();
    s
}

fn unique_rename_temp_path(parent: &std::path::Path, idx: usize) -> Result<PathBuf, String> {
    let mut random = [0u8; 16];
    getrandom::fill(&mut random)
        .map_err(|e| format!("Failed to generate secure temporary name: {e}"))?;
    let token = random
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Ok(parent.join(format!(".simplefile-rename-tmp-{idx}-{token}")))
}

fn rename_no_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    if destination.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "Destination already exists",
        ));
    }
    std::fs::rename(source, destination)
}

fn move_to_unique_rename_temp(source: &Path, parent: &Path, idx: usize) -> Result<PathBuf, String> {
    for _ in 0..128 {
        let candidate = unique_rename_temp_path(parent, idx)?;
        match rename_no_replace(source, &candidate) {
            Ok(()) => return Ok(candidate),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Failed to prepare rename: {e}")),
        }
    }
    Err("Failed to choose a unique temporary rename path".to_string())
}

fn rollback_detail(from: &Path, to: &Path, error: &std::io::Error) -> String {
    format!("{} -> {} ({})", from.display(), to.display(), error)
}

fn batch_rename_recovery_error(
    phase_error: &std::io::Error,
    recovery_failures: Vec<String>,
) -> String {
    if recovery_failures.is_empty() {
        format!("Failed to finish batch rename: {phase_error}")
    } else {
        format!(
            "Failed to finish batch rename: {}. Some paths could not be restored: {}",
            phase_error,
            recovery_failures.join("; ")
        )
    }
}

/// Rename a batch of files using a two-phase temporary-name strategy.
///
/// This is primarily used by Advanced Rename. A direct loop over `rename_entry`
/// can fail for case-only changes on case-insensitive filesystems, and it can
/// also fail for name swaps such as `a.txt -> b.txt` and `b.txt -> a.txt`.
/// This command first moves every selected item to a unique hidden temporary
/// name in its original parent folder, then moves each temporary item to its
/// final target. That guarantees selected items never block one another.
#[tauri::command]
pub async fn batch_rename(entries: Vec<RenameRequest>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if entries.is_empty() {
            return Ok(Vec::new());
        }

        let mut plans: Vec<RenamePlan> = Vec::with_capacity(entries.len());
        let mut source_keys = HashSet::new();
        let mut final_keys = HashSet::new();

        for req in &entries {
            validate_name(&req.new_name)?;
            let source_path = validate_path_no_follow(&req.path)?;
            let parent = source_path
                .parent()
                .ok_or_else(|| "Cannot get parent directory".to_string())?;
            let final_path = parent.join(&req.new_name);
            let source_key = path_collision_key(&source_path);
            let final_key = path_collision_key(&final_path);

            if !source_keys.insert(source_key) {
                return Err(format!("Duplicate source in batch rename: {}", req.path));
            }
            if !final_keys.insert(final_key) {
                return Err(format!(
                    "Two selected files would be renamed to the same name: {}",
                    req.new_name
                ));
            }

            plans.push(RenamePlan {
                source_path,
                temp_path: None,
                final_path,
            });
        }

        // Refuse to overwrite files outside the selected batch. A target that
        // already exists is allowed only if it is one of the selected sources.
        for plan in &plans {
            let final_key = path_collision_key(&plan.final_path);
            if plan.final_path.exists() && !source_keys.contains(&final_key) {
                let name = plan.final_path.file_name().map_or_else(
                    || plan.final_path.to_string_lossy().to_string(),
                    |n| n.to_string_lossy().to_string(),
                );
                return Err(format!(
                    "A file or directory with that name already exists: {name}"
                ));
            }
        }

        let mut moved_to_temp: Vec<(PathBuf, PathBuf)> = Vec::new();
        for (idx, plan) in plans.iter_mut().enumerate() {
            let parent = plan
                .source_path
                .parent()
                .ok_or_else(|| "Cannot get parent directory".to_string())?;
            match move_to_unique_rename_temp(&plan.source_path, parent, idx) {
                Ok(temp_path) => {
                    moved_to_temp.push((temp_path.clone(), plan.source_path.clone()));
                    plan.temp_path = Some(temp_path);
                }
                Err(e) => {
                    let mut recovery_failures = Vec::new();
                    for (temp, source) in moved_to_temp.iter().rev() {
                        if let Err(rollback_err) = fs::rename(temp, source) {
                            recovery_failures.push(rollback_detail(temp, source, &rollback_err));
                        }
                    }
                    if recovery_failures.is_empty() {
                        return Err(e);
                    }
                    return Err(format!(
                        "{}. Some paths could not be restored: {}",
                        e,
                        recovery_failures.join("; ")
                    ));
                }
            }
        }

        let mut finalized: Vec<(PathBuf, PathBuf)> = Vec::new();
        for plan in &plans {
            let temp_path = plan
                .temp_path
                .as_ref()
                .ok_or_else(|| "Batch rename temp path was not prepared".to_string())?;
            if let Err(e) = rename_no_replace(temp_path, &plan.final_path) {
                let mut recovery_failures = Vec::new();
                for (final_path, source_path) in finalized.iter().rev() {
                    if let Err(rollback_err) = fs::rename(final_path, source_path) {
                        recovery_failures.push(rollback_detail(
                            final_path,
                            source_path,
                            &rollback_err,
                        ));
                    }
                }
                for remaining in &plans {
                    if let Some(temp_path) = remaining.temp_path.as_ref() {
                        if temp_path.exists() {
                            if let Err(rollback_err) = fs::rename(temp_path, &remaining.source_path)
                            {
                                recovery_failures.push(rollback_detail(
                                    temp_path,
                                    &remaining.source_path,
                                    &rollback_err,
                                ));
                            }
                        }
                    }
                }
                return Err(batch_rename_recovery_error(&e, recovery_failures));
            }
            finalized.push((plan.final_path.clone(), plan.source_path.clone()));
        }

        Ok(plans
            .into_iter()
            .map(|p| p.final_path.to_string_lossy().to_string())
            .collect())
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
}

/// Cancel the in-progress item count, if any.
#[tauri::command]
pub fn cancel_count_items(state: tauri::State<'_, Arc<AppState>>) {
    state.cancel_item_count();
}

#[tauri::command]
pub async fn get_entry_info(
    path: String,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<FileEntry, String> {
    let state = state.inner().clone();
    let generation = state.begin_item_count();

    tauri::async_runtime::spawn_blocking(move || {
        // Use lstat so get_file_entry sees the symlink node and correctly sets
        // is_symlink / symlink_target.  validate_existing_path would canonicalise
        // the path, causing get_file_entry to always report is_symlink = false.
        let path_buf = validate_path_no_follow(&path)?;
        let mut entry =
            get_file_entry(&path_buf).ok_or_else(|| "Failed to get file info".to_string())?;
        if entry.is_dir {
            entry.size = count_items_scoped(
                &path_buf,
                &state.item_count_cancel,
                Some((&state.item_count_generation, generation)),
            )
            .ok_or_else(|| "cancelled".to_string())?;
        }
        Ok(entry)
    })
    .await
    .map_err(|e| format!("File info task failed: {e}"))?
}

// ============================================================================
// Simple Copy/Move (Legacy)
// ============================================================================

#[tauri::command]
pub async fn copy_entry(source: String, destination: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source_path = validate_existing_path_no_resolve(&source)?;
        let dest_path = validate_existing_path_no_resolve(&destination)?;
        if !dest_path.is_dir() {
            return Err("Destination must be a directory".into());
        }
        let file_name = source_path
            .file_name()
            .ok_or_else(|| "Cannot get file name".to_string())?;
        let final_dest = dest_path.join(file_name);

        if std::fs::symlink_metadata(&final_dest).is_ok() {
            return Err(format!(
                "CONFLICT: destination already exists: {}",
                final_dest.to_string_lossy()
            ));
        }

        if source_path.is_dir() {
            copy_dir_iterative(&source_path, &final_dest)?;
        } else {
            copy_file_exclusive_preserve_times(&source_path, &final_dest)?;
        }
        Ok(final_dest.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
}

pub(crate) fn copy_dir_iterative(src: &Path, dst: &Path) -> Result<(), String> {
    // Guard against copying a directory into itself or one of its own subdirectories,
    // which would produce an infinite loop of nested directories until the path length
    // limit or disk space is exhausted.
    if let Ok(canonical_src) = src.canonicalize() {
        // dst may not exist yet; canonicalize its parent to resolve symlinks/".." in
        // the containing directory, then re-attach the final component.
        let canonical_dst = dst
            .parent()
            .and_then(|p| p.canonicalize().ok())
            .map(|p| p.join(dst.file_name().unwrap_or_default()));
        if let Some(cdst) = canonical_dst {
            if cdst.starts_with(&canonical_src) {
                return Err(
                    "Cannot copy a directory into itself or one of its subdirectories".to_string(),
                );
            }
        }
    }

    let mut stack: Vec<(PathBuf, PathBuf)> = vec![(src.to_path_buf(), dst.to_path_buf())];
    let mut copied_dirs: Vec<(PathBuf, PathBuf)> = Vec::new();

    while let Some((src_path, dst_path)) = stack.pop() {
        // Use symlink_metadata (lstat) once so we can branch on what the
        // entry itself *is* (dir / symlink / file) without following links.
        // is_dir() follows symlinks and can loop forever on circular chains.
        let lstat = fs::symlink_metadata(&src_path).ok();
        let ft = lstat.as_ref().map(std::fs::Metadata::file_type);
        let is_real_dir = ft.as_ref().is_some_and(std::fs::FileType::is_dir);
        let is_symlink = ft.as_ref().is_some_and(std::fs::FileType::is_symlink);

        if is_real_dir {
            create_dir_exclusive(&dst_path)?;
            copied_dirs.push((src_path.clone(), dst_path.clone()));
            for entry in
                fs::read_dir(&src_path).map_err(|e| format!("Failed to read directory: {e}"))?
            {
                let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
                let child_src = entry.path();
                let child_dst = dst_path.join(entry.file_name());
                stack.push((child_src, child_dst));
            }
        } else if is_symlink {
            // Recreate the symlink itself rather than following it and copying
            // the target data — a symlink to a 50 GB file should copy as a
            // tiny link, not 50 GB of bytes.
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {e}"))?;
            }
            let link_target = fs::read_link(&src_path)
                .map_err(|e| format!("Failed to read symlink target: {e}"))?;
            std::os::unix::fs::symlink(&link_target, &dst_path)
                .map_err(|e| format!("Failed to create symlink: {e}"))?;
        } else {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {e}"))?;
            }
            // Guard against silent overwrites: the frontend can detect the
            // CONFLICT prefix and prompt the user for resolution.
            if std::fs::symlink_metadata(&dst_path).is_ok() {
                return Err(format!(
                    "CONFLICT: destination already exists: {}",
                    dst_path.to_string_lossy()
                ));
            }
            copy_file_exclusive_preserve_times(&src_path, &dst_path)?;
        }
    }
    for (src_dir, dst_dir) in copied_dirs.into_iter().rev() {
        preserve_basic_metadata(&src_dir, &dst_dir)?;
    }
    Ok(())
}

fn create_dir_exclusive(path: &Path) -> Result<(), String> {
    fs::create_dir(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            format!(
                "CONFLICT: destination already exists: {}",
                path.to_string_lossy()
            )
        } else {
            format!("Failed to create directory: {e}")
        }
    })
}

pub(crate) fn preserve_basic_metadata(src: &Path, dst: &Path) -> Result<(), String> {
    let metadata = fs::metadata(src).map_err(|e| format!("Failed to stat copied source: {e}"))?;
    fs::set_permissions(dst, metadata.permissions())
        .map_err(|e| format!("Failed to preserve permissions: {e}"))?;
    filetime::set_file_times(
        dst,
        filetime::FileTime::from_last_access_time(&metadata),
        filetime::FileTime::from_last_modification_time(&metadata),
    )
    .map_err(|e| format!("Failed to preserve file timestamps: {e}"))?;
    preserve_creation_time(&metadata, dst)?;
    preserve_platform_metadata(src, dst)
}

fn preserve_creation_time(_metadata: &fs::Metadata, _dst: &Path) -> Result<(), String> {
    Ok(())
}

fn preserve_platform_metadata(src: &Path, dst: &Path) -> Result<(), String> {
    let attrs = match xattr::list(src) {
        Ok(attrs) => attrs,
        Err(e) if optional_metadata_error(&e) => return Ok(()),
        Err(e) => return Err(format!("Failed to list extended attributes: {e}")),
    };

    for name in attrs {
        let Some(value) = (match xattr::get(src, &name) {
            Ok(value) => value,
            Err(e) if optional_metadata_error(&e) => continue,
            Err(e) => {
                return Err(format!(
                    "Failed to read extended attribute {}: {}",
                    name.to_string_lossy(),
                    e
                ));
            }
        }) else {
            continue;
        };

        if let Err(e) = xattr::set(dst, &name, &value) {
            if optional_metadata_error(&e) {
                continue;
            }
            return Err(format!(
                "Failed to preserve extended attribute {}: {}",
                name.to_string_lossy(),
                e
            ));
        }
    }

    Ok(())
}

fn optional_metadata_error(error: &std::io::Error) -> bool {
    matches!(
        error.kind(),
        std::io::ErrorKind::Unsupported
            | std::io::ErrorKind::PermissionDenied
            | std::io::ErrorKind::NotFound
    )
}

fn copy_file_exclusive_preserve_times(src: &Path, dst: &Path) -> Result<u64, String> {
    let mut created_destination = false;
    let result = (|| -> Result<u64, String> {
        let mut source =
            fs::File::open(src).map_err(|e| format!("Failed to open source file: {e}"))?;
        let mut destination = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dst)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::AlreadyExists {
                    format!(
                        "CONFLICT: destination already exists: {}",
                        dst.to_string_lossy()
                    )
                } else {
                    format!("Failed to create destination file: {e}")
                }
            })?;
        created_destination = true;
        let copied = io::copy(&mut source, &mut destination)
            .map_err(|e| format!("Failed to copy file: {e}"))?;
        preserve_basic_metadata(src, dst)?;
        Ok(copied)
    })();

    if created_destination && result.is_err() {
        let _ = fs::remove_file(dst);
    }
    result
}

#[tauri::command]
pub async fn move_entry(source: String, destination: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Use lstat so we move the symlink itself, not its resolved target.
        let source_path = validate_path_no_follow(&source)?;
        let dest_path = validate_existing_path_no_resolve(&destination)?;
        let file_name = source_path
            .file_name()
            .ok_or_else(|| "Cannot get file name".to_string())?;
        let final_dest = dest_path.join(file_name);

        // Refuse to silently overwrite an existing entry.  The caller (frontend)
        // should detect the CONFLICT prefix and prompt the user.
        // This also prevents the self-move data-loss scenario: if source and
        // final_dest resolve to the same file the fallback copy+delete path would
        // copy the file over itself (which may fail), then delete it on rollback.
        if final_dest.exists() {
            return Err(format!(
                "CONFLICT: destination already exists: {}",
                final_dest.to_string_lossy()
            ));
        }

        // Keep the fallback path explicit so cross-device rename failures still
        // copy and remove the source instead of surfacing as a hard failure.
        let network_involved = false;
        if network_involved || fs::rename(&source_path, &final_dest).is_err() {
            if source_path.is_dir() {
                // If the copy fails partway (e.g. out of disk space), roll back by
                // removing any partially-written destination so the user is not
                // left with a corrupted, incomplete directory tree.
                if let Err(copy_err) = copy_dir_iterative(&source_path, &final_dest) {
                    let _ = fs::remove_dir_all(&final_dest);
                    return Err(copy_err);
                }
                fs::remove_dir_all(&source_path)
                    .map_err(|e| format!("Copied but failed to delete source: {e}"))?;
            } else {
                match copy_file_exclusive_preserve_times(&source_path, &final_dest) {
                    Ok(_) => {}
                    Err(e) => {
                        // Roll back the partial file at the destination.
                        let _ = fs::remove_file(&final_dest);
                        return Err(e);
                    }
                }
                fs::remove_file(&source_path)
                    .map_err(|e| format!("Copied but failed to delete source: {e}"))?;
            }
        }
        Ok(final_dest.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
}

// ============================================================================
// Tree / Directory View
// ============================================================================

#[tauri::command]
pub async fn list_subdirectories(path: String) -> Result<Vec<TreeNode>, String> {
    if crate::archive::split_archive_path(&path)?.is_some() {
        return Ok(Vec::new());
    }

    let path_buf = validate_existing_path_no_resolve(&path)?;
    if !path_buf.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }

    let mut nodes: Vec<TreeNode> = Vec::new();
    let read_dir = fs::read_dir(&path_buf).map_err(|e| format!("Failed to read directory: {e}"))?;

    for entry in read_dir.flatten() {
        if let Ok(file_type) = entry.file_type() {
            if file_type.is_dir() {
                let entry_path = entry.path();
                let name = entry_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                if name.starts_with('.') {
                    continue;
                }
                // Check if this directory actually has subdirectories
                let has_children = fs::read_dir(&entry_path).is_ok_and(|entries| {
                    entries
                        .filter_map(std::result::Result::ok)
                        .any(|e| e.file_type().is_ok_and(|ft| ft.is_dir()))
                });
                nodes.push(TreeNode {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    has_children,
                    children: Vec::new(),
                });
            }
        }
    }
    nodes.sort_by_cached_key(|node| node.name.to_lowercase());
    Ok(nodes)
}

// ============================================================================
// Folder Size
// ============================================================================

/// Cancel the in-progress folder size calculation, if any.
#[tauri::command]
pub fn cancel_folder_size(state: tauri::State<'_, Arc<AppState>>) {
    state.cancel_folder_size();
}

/// Cancel passive direct child-count requests for the file list.
#[tauri::command]
pub fn cancel_folder_item_count(state: tauri::State<'_, Arc<AppState>>) {
    state.cancel_folder_item_count();
}

#[tauri::command]
pub async fn count_folder_items(
    path: String,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<u64, String> {
    if let Some(listing) = crate::archive::list_archive_directory(&path)? {
        return Ok(listing.entries.len() as u64);
    }

    let state = state.inner().clone();
    let generation = state.begin_folder_item_count();

    tauri::async_runtime::spawn_blocking(move || {
        let path_buf = validate_existing_path_no_resolve(&path)?;
        if !path_buf.is_dir() {
            return Err(format!("Path is not a directory: {path}"));
        }

        count_directory_entries(
            &path_buf,
            &state.folder_item_count_cancel,
            Some((&state.folder_item_count_generation, generation)),
        )
        .ok_or_else(|| "cancelled".to_string())
    })
    .await
    .map_err(|e| format!("Folder item count task failed: {e}"))?
}

#[tauri::command]
pub async fn calculate_folder_size(
    path: String,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<u64, String> {
    let state = state.inner().clone();
    let generation = state.begin_folder_size();

    tauri::async_runtime::spawn_blocking(move || {
        let path_buf = validate_existing_path_no_resolve(&path)?;
        if !path_buf.is_dir() {
            return Err(format!("Path is not a directory: {path}"));
        }

        calculate_size_recursive_scoped(
            &path_buf,
            &state.folder_size_cancel,
            Some((&state.folder_size_generation, generation)),
        )
        .ok_or_else(|| "cancelled".to_string())
    })
    .await
    .map_err(|e| format!("Folder size task failed: {e}"))?
}

pub(crate) fn calculate_size_recursive_scoped(
    path: &Path,
    cancel: &std::sync::atomic::AtomicBool,
    generation: Option<(&std::sync::atomic::AtomicU64, u64)>,
) -> Option<u64> {
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(current) = stack.pop() {
        if should_cancel_metadata(cancel, generation) {
            return None;
        }
        if let Ok(entries) = fs::read_dir(&current) {
            for entry in entries.flatten() {
                if should_cancel_metadata(cancel, generation) {
                    return None;
                }
                // Use DirEntry::file_type() which is lstat-based (no symlink
                // follow).  entry_path.is_dir() follows symlinks and would
                // cause an infinite loop on circular symlink chains.
                let Ok(ft) = entry.file_type() else { continue };
                if ft.is_dir() {
                    stack.push(entry.path());
                } else if ft.is_file() {
                    if let Ok(metadata) = entry.metadata() {
                        total += metadata.len();
                    }
                }
                // Symlinks are intentionally not recursed into.
            }
        }
    }
    Some(total)
}

fn should_cancel_metadata(
    cancel: &std::sync::atomic::AtomicBool,
    generation: Option<(&std::sync::atomic::AtomicU64, u64)>,
) -> bool {
    cancel.load(Ordering::Relaxed)
        || generation.is_some_and(|(current, expected)| current.load(Ordering::Relaxed) != expected)
}

// ============================================================================
// Conflict-aware Copy/Move
// ============================================================================

fn remove_existing_path(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path)
        .map_err(|e| format!("Failed to stat existing destination: {e}"))?;
    if meta.file_type().is_symlink() {
        fs::remove_file(path).map_err(|e| format!("Failed to remove destination symlink: {e}"))?;
    } else if meta.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("Failed to remove destination directory: {e}"))?;
    } else {
        fs::remove_file(path).map_err(|e| format!("Failed to remove destination file: {e}"))?;
    }
    Ok(())
}

fn unique_destination_path(dest_dir: &Path, file_name: &std::ffi::OsStr) -> PathBuf {
    let original = std::path::Path::new(file_name);
    let stem = original.file_stem().map_or_else(
        || original.to_string_lossy().to_string(),
        |s| s.to_string_lossy().to_string(),
    );
    let ext = original
        .extension()
        .map(|e| e.to_string_lossy().to_string());
    for i in 1..10_000u32 {
        let candidate_name = match &ext {
            Some(ext) if !ext.is_empty() => format!("{} ({}){}.{}", stem, i, "", ext),
            _ => format!("{stem} ({i})"),
        };
        let candidate = dest_dir.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }
    dest_dir.join(file_name)
}

fn is_keep_both_action(conflict_action: &str) -> bool {
    matches!(
        conflict_action.to_ascii_lowercase().as_str(),
        "rename" | "keep-both" | "keep_both"
    )
}

fn resolve_destination(
    source_path: &Path,
    dest_dir: &Path,
    conflict_action: &str,
) -> Result<Option<PathBuf>, String> {
    let file_name = source_path
        .file_name()
        .ok_or_else(|| "Cannot get file name".to_string())?;
    let final_dest = dest_dir.join(file_name);
    if !final_dest.exists() {
        return Ok(Some(final_dest));
    }

    match conflict_action.to_ascii_lowercase().as_str() {
        "skip" => Ok(None),
        "replace" => {
            if let (Ok(src_can), Ok(dst_can)) =
                (source_path.canonicalize(), final_dest.canonicalize())
            {
                if src_can == dst_can {
                    return Ok(Some(final_dest));
                }
            }
            remove_existing_path(&final_dest)?;
            Ok(Some(final_dest))
        }
        "rename" | "keep-both" | "keep_both" => {
            Ok(Some(unique_destination_path(dest_dir, file_name)))
        }
        _ => Err(format!(
            "CONFLICT: destination already exists: {}",
            final_dest.to_string_lossy()
        )),
    }
}

fn copy_path_to_destination(source_path: &Path, final_dest: &Path) -> Result<(), String> {
    let meta =
        fs::symlink_metadata(source_path).map_err(|e| format!("Failed to stat source: {e}"))?;
    if meta.file_type().is_dir() {
        copy_dir_iterative(source_path, final_dest)
    } else if meta.file_type().is_symlink() {
        if let Some(parent) = final_dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {e}"))?;
        }
        let link_target = fs::read_link(source_path)
            .map_err(|e| format!("Failed to read symlink target: {e}"))?;
        std::os::unix::fs::symlink(&link_target, final_dest)
            .map_err(|e| format!("Failed to create symlink: {e}"))?;
        Ok(())
    } else {
        if let Some(parent) = final_dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {e}"))?;
        }
        copy_file_exclusive_preserve_times(source_path, final_dest).map(|_| ())
    }
}

fn move_path_to_destination(
    source_path: &Path,
    final_dest: &Path,
    allow_rename: bool,
) -> Result<(), String> {
    let network_involved = false;
    if allow_rename && !network_involved && fs::rename(source_path, final_dest).is_ok() {
        return Ok(());
    }
    copy_path_to_destination(source_path, final_dest)?;
    remove_existing_path(source_path)
        .map_err(|e| format!("Copied but failed to delete source: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn copy_entry_resolved(
    source: String,
    destination: String,
    conflict_action: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    if crate::archive::should_handle_transfer(&source, &destination)? {
        return crate::archive::copy_entry_resolved(
            source,
            destination,
            conflict_action,
            Some(&app),
        );
    }

    let source_path = validate_path_no_follow(&source)?;
    let dest_dir = validate_existing_path_no_resolve(&destination)?;
    if !dest_dir.is_dir() {
        return Err(format!("Destination is not a directory: {destination}"));
    }
    let retry_keep_both = is_keep_both_action(&conflict_action);
    for _ in 0..100 {
        match resolve_destination(&source_path, &dest_dir, &conflict_action)? {
            Some(final_dest) => match copy_path_to_destination(&source_path, &final_dest) {
                Ok(()) => return Ok(final_dest.to_string_lossy().to_string()),
                Err(e) if retry_keep_both && e.starts_with("CONFLICT:") => continue,
                Err(e) => return Err(e),
            },
            None => return Ok(format!("SKIPPED:{source}")),
        }
    }
    Err("Could not choose a unique destination after repeated conflicts".to_string())
}

#[tauri::command]
pub fn move_entry_resolved(
    source: String,
    destination: String,
    conflict_action: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    if crate::archive::should_handle_transfer(&source, &destination)? {
        return crate::archive::move_entry_resolved(
            source,
            destination,
            conflict_action,
            Some(&app),
        );
    }

    let source_path = validate_path_no_follow(&source)?;
    let dest_dir = validate_existing_path_no_resolve(&destination)?;
    if !dest_dir.is_dir() {
        return Err(format!("Destination is not a directory: {destination}"));
    }
    let retry_keep_both = is_keep_both_action(&conflict_action);
    for _ in 0..100 {
        match resolve_destination(&source_path, &dest_dir, &conflict_action)? {
            Some(final_dest) => {
                let allow_rename = !retry_keep_both;
                match move_path_to_destination(&source_path, &final_dest, allow_rename) {
                    Ok(()) => return Ok(final_dest.to_string_lossy().to_string()),
                    Err(e) if retry_keep_both && e.starts_with("CONFLICT:") => continue,
                    Err(e) => return Err(e),
                }
            }
            None => return Ok(format!("SKIPPED:{source}")),
        }
    }
    Err("Could not choose a unique destination after repeated conflicts".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("simplefile_fs_ops_{}_{}", name, nanos))
    }

    #[test]
    fn resolve_destination_skip_keeps_existing_destination() {
        let base = unique_temp_path("skip_conflict");
        let _ = fs::remove_dir_all(&base);
        let source_dir = base.join("source");
        let dest_dir = base.join("dest");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();

        let source = source_dir.join("same.txt");
        let destination = dest_dir.join("same.txt");
        fs::write(&source, b"source").unwrap();
        fs::write(&destination, b"destination").unwrap();

        let resolved = resolve_destination(&source, &dest_dir, "skip").unwrap();

        assert!(resolved.is_none());
        assert_eq!(fs::read(&source).unwrap(), b"source");
        assert_eq!(fs::read(&destination).unwrap(), b"destination");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn resolve_destination_rename_keeps_existing_destination() {
        let base = unique_temp_path("rename_conflict");
        let _ = fs::remove_dir_all(&base);
        let source_dir = base.join("source");
        let dest_dir = base.join("dest");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();

        let source = source_dir.join("same.txt");
        let destination = dest_dir.join("same.txt");
        fs::write(&source, b"source").unwrap();
        fs::write(&destination, b"destination").unwrap();

        let resolved = resolve_destination(&source, &dest_dir, "rename")
            .unwrap()
            .expect("rename should produce destination");

        assert_eq!(resolved.file_name().unwrap(), "same (1).txt");
        assert!(!resolved.exists());
        assert_eq!(fs::read(&source).unwrap(), b"source");
        assert_eq!(fs::read(&destination).unwrap(), b"destination");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn resolve_destination_replace_removes_existing_destination() {
        let base = unique_temp_path("replace_conflict");
        let _ = fs::remove_dir_all(&base);
        let source_dir = base.join("source");
        let dest_dir = base.join("dest");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();

        let source = source_dir.join("same.txt");
        let destination = dest_dir.join("same.txt");
        fs::write(&source, b"source").unwrap();
        fs::write(&destination, b"destination").unwrap();

        let resolved = resolve_destination(&source, &dest_dir, "replace")
            .unwrap()
            .expect("replace should produce destination");

        assert_eq!(resolved, destination);
        assert!(source.exists());
        assert!(!destination.exists());

        copy_path_to_destination(&source, &resolved).expect("copy replacement");
        assert_eq!(fs::read(&resolved).unwrap(), b"source");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn resolve_destination_unknown_action_returns_conflict() {
        let base = unique_temp_path("unknown_conflict");
        let _ = fs::remove_dir_all(&base);
        let source_dir = base.join("source");
        let dest_dir = base.join("dest");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();

        let source = source_dir.join("same.txt");
        let destination = dest_dir.join("same.txt");
        fs::write(&source, b"source").unwrap();
        fs::write(&destination, b"destination").unwrap();

        let err = resolve_destination(&source, &dest_dir, "error").unwrap_err();

        assert!(err.starts_with("CONFLICT:"));
        assert_eq!(fs::read(&source).unwrap(), b"source");
        assert_eq!(fs::read(&destination).unwrap(), b"destination");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn exclusive_copy_does_not_overwrite_or_remove_existing_destination() {
        let base = unique_temp_path("exclusive_copy_conflict");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let source = base.join("source.txt");
        let destination = base.join("destination.txt");
        fs::write(&source, b"source").unwrap();
        fs::write(&destination, b"destination").unwrap();

        let err = copy_file_exclusive_preserve_times(&source, &destination).unwrap_err();

        assert!(err.starts_with("CONFLICT:"));
        assert_eq!(fs::read(&source).unwrap(), b"source");
        assert_eq!(fs::read(&destination).unwrap(), b"destination");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn exclusive_copy_preserves_modified_time() {
        let base = unique_temp_path("exclusive_copy_timestamps");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let source = base.join("source.txt");
        let destination = base.join("destination.txt");
        fs::write(&source, b"source").unwrap();

        let expected = filetime::FileTime::from_unix_time(1_700_000_000, 0);
        filetime::set_file_times(&source, expected, expected).unwrap();

        copy_file_exclusive_preserve_times(&source, &destination).unwrap();

        let actual =
            filetime::FileTime::from_last_modification_time(&fs::metadata(&destination).unwrap());
        assert_eq!(actual.unix_seconds(), expected.unix_seconds());

        let _ = fs::remove_dir_all(&base);
    }
}
