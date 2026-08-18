use crate::models::{CleanupResult, DuplicateGroup, DuplicateScanResult, ProgressUpdate};
use crate::sha256::{hash_reader, hex_encode};
use crate::state::AppState;
use crate::utils::validate_existing_path_no_resolve;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

const DEFAULT_LARGE_FILE_THRESHOLD: u64 = 100 * 1024 * 1024;
const CLEANUP_OPERATION_ID: &str = "disk_cleanup";
const DUPLICATES_OPERATION_ID: &str = "find_duplicates";
const FIRST_PASS_PROGRESS_INTERVAL: u64 = 128;
const HASH_PROGRESS_INTERVAL: u64 = 16;
const PREFIX_HASH_BYTES: u64 = 64 * 1024;

/// Perform a disk cleanup scan on a given directory. This helper walks
/// the directory tree and identifies two categories of interest:
///
/// * Large files that exceed a caller-provided size threshold.
/// * Groups of duplicate files where the file contents are identical.
///
/// The scan returns a `CleanupResult` containing both large files and
/// duplicate groups. Duplicate groups include all files with the same
/// computed SHA-256 hash; callers can decide which to delete.
#[tauri::command]
pub async fn disk_cleanup(
    directory: String,
    size_threshold: Option<u64>,
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CleanupResult, String> {
    let root = validate_existing_path_no_resolve(&directory)?;
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {directory}"));
    }

    let threshold = size_threshold.unwrap_or(DEFAULT_LARGE_FILE_THRESHOLD);
    let cancel = state.disk_cleanup_cancel.clone();
    cancel.store(false, Ordering::Relaxed);

    let result = match tokio::task::spawn_blocking(move || {
        scan_disk_cleanup(&root, threshold, &cancel, |current, total, item| {
            emit_cleanup_progress(&app, current, total, item);
        })
    })
    .await
    {
        Ok(result) => result,
        Err(e) => Err(format!("Disk cleanup task failed: {e}")),
    };

    state.disk_cleanup_cancel.store(false, Ordering::Relaxed);
    result
}

/// Cancel the in-progress disk cleanup scan, if any.
#[tauri::command]
pub fn cancel_disk_cleanup(state: tauri::State<'_, Arc<AppState>>) {
    state.cancel_disk_cleanup();
}

/// Scan a directory tree for duplicate file contents.
#[tauri::command]
pub async fn find_duplicates(
    directory: String,
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<DuplicateScanResult, String> {
    let root = validate_existing_path_no_resolve(&directory)?;
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {directory}"));
    }

    let cancel = state.disk_cleanup_cancel.clone();
    cancel.store(false, Ordering::Relaxed);

    let result = match tokio::task::spawn_blocking(move || {
        scan_duplicates(&root, &cancel, |current, total, item| {
            emit_named_progress(&app, DUPLICATES_OPERATION_ID, "duplicates", current, total, item);
        })
    })
    .await
    {
        Ok(result) => result,
        Err(e) => Err(format!("Duplicate scan task failed: {e}")),
    };

    state.disk_cleanup_cancel.store(false, Ordering::Relaxed);
    result
}

fn emit_cleanup_progress(app: &AppHandle, current: u64, total: u64, current_item: &str) {
    emit_named_progress(app, CLEANUP_OPERATION_ID, "cleanup", current, total, current_item);
}

fn emit_named_progress(
    app: &AppHandle,
    operation_id: &str,
    operation_type: &str,
    current: u64,
    total: u64,
    current_item: &str,
) {
    let _ = app.emit(
        "operation-progress",
        ProgressUpdate {
            operation_id: operation_id.to_string(),
            operation_type: operation_type.to_string(),
            current,
            total,
            current_item: current_item.to_string(),
            status: "running".to_string(),
            error: None,
        },
    );
}

fn scan_disk_cleanup<F>(
    root: &Path,
    threshold: u64,
    cancel: &AtomicBool,
    mut progress: F,
) -> Result<CleanupResult, String>
where
    F: FnMut(u64, u64, &str),
{
    check_cancelled(cancel)?;

    let mut large_files: Vec<(String, u64)> = Vec::new();
    let mut size_map: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    let mut scanned_files = 0u64;

    progress(0, 0, "Scanning files");

    for entry in WalkDir::new(root).follow_links(false) {
        check_cancelled(cancel)?;
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.into_path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };

        scanned_files += 1;
        if scanned_files == 1 || scanned_files.is_multiple_of(FIRST_PASS_PROGRESS_INTERVAL) {
            progress(scanned_files, 0, &path.to_string_lossy());
        }

        let size = metadata.len();
        if size >= threshold {
            large_files.push((path.to_string_lossy().to_string(), size));
        }
        size_map.entry(size).or_default().push(path);
    }

    let (duplicates, _) = collect_duplicate_groups(size_map, cancel, &mut progress)?;

    large_files.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    Ok(CleanupResult {
        large_files,
        duplicates,
    })
}

fn scan_duplicates<F>(
    root: &Path,
    cancel: &AtomicBool,
    mut progress: F,
) -> Result<DuplicateScanResult, String>
where
    F: FnMut(u64, u64, &str),
{
    check_cancelled(cancel)?;
    let mut size_map: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    let mut scanned_files = 0u64;
    progress(0, 0, "Scanning files");

    for entry in WalkDir::new(root).follow_links(false) {
        check_cancelled(cancel)?;
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.into_path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() {
            continue;
        }

        scanned_files += 1;
        if scanned_files == 1 || scanned_files.is_multiple_of(FIRST_PASS_PROGRESS_INTERVAL) {
            progress(scanned_files, 0, &path.to_string_lossy());
        }
        size_map.entry(metadata.len()).or_default().push(path);
    }

    let (groups, compared_files) = collect_duplicate_groups(size_map, cancel, &mut progress)?;
    Ok(DuplicateScanResult {
        groups,
        scanned_files,
        compared_files,
    })
}

fn collect_duplicate_groups<F>(
    size_map: HashMap<u64, Vec<PathBuf>>,
    cancel: &AtomicBool,
    progress: &mut F,
) -> Result<(Vec<DuplicateGroup>, u64), String>
where
    F: FnMut(u64, u64, &str),
{
    let duplicate_candidates: u64 = size_map
        .values()
        .filter(|files| files.len() > 1)
        .map(|files| files.len() as u64)
        .sum();

    let mut hashed_files = 0u64;
    let mut duplicates: Vec<DuplicateGroup> = Vec::new();

    for (size, files) in size_map {
        check_cancelled(cancel)?;
        if files.len() < 2 {
            continue;
        }

        let groups = hash_same_size_files(size, files, cancel, progress, &mut hashed_files, duplicate_candidates)?;
        duplicates.extend(groups);
    }

    duplicates.sort_by(|a, b| {
        b.size
            .cmp(&a.size)
            .then_with(|| a.files.first().cmp(&b.files.first()))
            .then_with(|| a.hash.cmp(&b.hash))
    });

    Ok((duplicates, hashed_files))
}

fn hash_same_size_files<F>(
    size: u64,
    files: Vec<PathBuf>,
    cancel: &AtomicBool,
    progress: &mut F,
    hashed_files: &mut u64,
    total: u64,
) -> Result<Vec<DuplicateGroup>, String>
where
    F: FnMut(u64, u64, &str),
{
    if size == 0 {
        let mut paths: Vec<String> = files
            .into_iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect();
        paths.sort();
        return Ok(vec![DuplicateGroup {
            hash: hex_encode(crate::sha256::hash_bytes(b"")),
            files: paths,
            size: 0,
        }]);
    }

    let prefix_groups = if size <= PREFIX_HASH_BYTES {
        HashMap::from([(String::new(), files)])
    } else {
        group_by_hash(files, Some(PREFIX_HASH_BYTES), cancel, progress, hashed_files, total)?
    };

    let mut duplicates = Vec::new();
    for prefix_files in prefix_groups.into_values() {
        check_cancelled(cancel)?;
        if prefix_files.len() < 2 {
            continue;
        }

        for (hash, group) in group_by_hash(
            prefix_files,
            None,
            cancel,
            progress,
            hashed_files,
            total,
        )? {
            if group.len() > 1 {
                let mut files: Vec<String> = group
                    .into_iter()
                    .map(|path| path.to_string_lossy().into_owned())
                    .collect();
                files.sort();
                duplicates.push(DuplicateGroup {
                    hash,
                    files,
                    size,
                });
            }
        }
    }

    Ok(duplicates)
}

fn group_by_hash<F>(
    files: Vec<PathBuf>,
    prefix: Option<u64>,
    cancel: &AtomicBool,
    progress: &mut F,
    hashed_files: &mut u64,
    total: u64,
) -> Result<HashMap<String, Vec<PathBuf>>, String>
where
    F: FnMut(u64, u64, &str),
{
    let mut hash_map: HashMap<String, Vec<PathBuf>> = HashMap::new();
    for file_path in files {
        check_cancelled(cancel)?;
        *hashed_files += 1;
        if *hashed_files == 1 || hashed_files.is_multiple_of(HASH_PROGRESS_INTERVAL) {
            progress(*hashed_files, total, &file_path.to_string_lossy());
        }

        match hash_file(&file_path, prefix, cancel) {
            Ok(hash) => hash_map.entry(hash).or_default().push(file_path),
            Err(_) => continue,
        }
    }
    Ok(hash_map)
}

fn hash_file(path: &Path, prefix: Option<u64>, cancel: &AtomicBool) -> Result<String, std::io::Error> {
    let mut file = fs::File::open(path)?;
    let digest = hash_reader(&mut file, prefix, Some(cancel))?;
    Ok(hex_encode(digest))
}

fn check_cancelled(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        Err("cancelled".to_string())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::scan_disk_cleanup;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("simplefile_cleanup_test_{}_{}", name, nanos))
    }

    #[test]
    fn scan_disk_cleanup_finds_large_and_duplicate_files() {
        let root = unique_temp_path("scan");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("large.bin"), vec![1u8; 16]).unwrap();
        fs::write(root.join("dupe_a.txt"), b"same").unwrap();
        fs::write(root.join("dupe_b.txt"), b"same").unwrap();
        fs::write(root.join("unique.txt"), b"different").unwrap();

        let cancel = AtomicBool::new(false);
        let result = scan_disk_cleanup(&root, 10, &cancel, |_, _, _| {}).unwrap();

        assert_eq!(result.large_files.len(), 1);
        assert!(result.large_files[0].0.ends_with("large.bin"));
        assert_eq!(result.large_files[0].1, 16);
        assert_eq!(result.duplicates.len(), 1);
        assert_eq!(result.duplicates[0].files.len(), 2);
        assert_eq!(result.duplicates[0].size, 4);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn scan_disk_cleanup_respects_cancellation() {
        let root = unique_temp_path("cancel");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("file.txt"), b"content").unwrap();

        let cancel = AtomicBool::new(true);
        let result = scan_disk_cleanup(&root, 1, &cancel, |_, _, _| {});

        assert_eq!(result.unwrap_err(), "cancelled");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn scan_duplicates_uses_prefix_then_full_hash() {
        let root = unique_temp_path("prefix");
        fs::create_dir_all(&root).unwrap();

        let shared = vec![7u8; 80 * 1024];
        let mut different = shared.clone();
        different[70 * 1024] = 9;
        fs::write(root.join("a.bin"), &shared).unwrap();
        fs::write(root.join("b.bin"), &shared).unwrap();
        fs::write(root.join("c.bin"), &different).unwrap();
        fs::write(root.join("unique.bin"), vec![1u8; 80 * 1024]).unwrap();

        let cancel = AtomicBool::new(false);
        let result = super::scan_duplicates(&root, &cancel, |_, _, _| {}).unwrap();

        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].files.len(), 2);
        assert_eq!(result.groups[0].size, 80 * 1024);

        let _ = fs::remove_dir_all(&root);
    }
}
