# SimpleFile Bug Report

Comprehensive analysis of the current codebase identifying potential bugs,
security issues, and logic errors. This report supersedes the previous
CODE_ANALYSIS.md — many issues from that report have since been fixed

**Maintenance update — 2026-05-18:** Cargo dependency resolution, Clippy,
frontend syntax checks, committed lockfile handling, updater startup behavior,
segmented download chunking, and CI audit behavior were re-verified. The RustSec warnings currently accepted
in CI are explicit transitive Tauri/Linux GTK and `urlpattern` advisories listed
in `SECURITY.md`; new advisories still fail the audit job.

**Maintenance update - 2026-05-24:** The latest hardening pass added a frontend/backend
invoke consistency check, removed `tauri-plugin-shell`, tightened terminal and Open With
process launching, added cancellable disk cleanup, added WinFsp installer/status support, moved
Windows rclone mounts to drive letters, and added safeguards so mounted rclone/WinFsp cloud drives
are listed through rclone instead of background WinFsp filesystem probes.

---

## Status of Previously Reported Issues (CODE_ANALYSIS.md)

The following issues from the prior analysis have been **resolved**:

| # | Issue | Status |
|---|-------|--------|
| 1 | Path traversal in create_directory/create_file | **Fixed** — `validate_name()` added |
| 2 | Tar/RAR extraction path traversal | **Fixed** — canonicalization checks added |
| 6 | move_with_progress silent delete failures | **Fixed** — now emits warning event |
| 8 | Grid view arrow key navigation | **Fixed** — `getGridColumnsPerRow()` used |
| 9 | selectAll full re-render | **Fixed** — now uses `updateSelectionVisuals()` |
| 10 | Version mismatch Cargo.toml vs tauri.conf.json | **Fixed** — app metadata is aligned at 1.1.0 |
| 11 | Updater placeholder values | **Fixed** — explicit placeholder config allows startup; production updater artifacts remain disabled |
| 13 | Non-unique operation ID | **Fixed** — atomic counter used |
| 17 | has_children always true | **Fixed** — now checks for subdirectories |
| 23 | list_directory doesn't validate paths | **Fixed** — validates readable paths while preserving rclone/WinFsp mount junctions |

The following issues from the prior analysis **remain unfixed**:

| # | Issue | Still Present |
|---|-------|---------------|
| 4 | CSP allows `unsafe-inline` for `style-src` | Yes (but `script-src` is clean) |
| 5 | Security audit failures silently ignored in CI | **Fixed** — audit is a hard failure with explicit accepted advisories |
| 12 | TOCTOU race in `create_file` | **Fixed** — uses atomic `create_new()` |
| 14 | Double filesystem traversal for copy progress | **Fixed** — progress copy uses single-pass discovery |
| 16 | O(n) selection lookups with array `.includes()` | Yes |
| 19 | Elements cached at module load time | **Fixed** — elements resolve lazily with cache invalidation |
| 20 | Reactive state proxy doesn't detect nested mutations | Yes |
| 24 | Search results overwrite `state.entries` | Partially fixed with `_savedEntries` |

---

## New Bugs Found

### Security

#### B01: `get_entry_info` bypasses path validation
**File:** `src-tauri/src/lib.rs:479-485`

Unlike other commands that use `validate_existing_path()` to canonicalize and
validate inputs, `get_entry_info` constructs a `PathBuf` directly:

```rust
fn get_entry_info(path: String) -> Result<FileEntry, String> {
    let path_buf = PathBuf::from(&path);  // No canonicalization
    if !path_buf.exists() { ... }
    get_file_entry(&path_buf).ok_or_else(...)
}
```

This means a path like `/home/user/../etc/shadow` would be accepted without
being resolved first, potentially revealing information about files outside
the intended scope.

---

#### B02: Legacy `copy_entry` and `move_entry` don't validate destination
**File:** `src-tauri/src/lib.rs:747-786`

The legacy (non-progress) copy and move commands accept an unvalidated
destination path. While the newer `copy_with_progress`/`move_with_progress`
also lack destination validation, the legacy commands are simpler attack
vectors since they accept raw strings:

```rust
fn copy_entry(source: String, destination: String) -> Result<String, String> {
    let dest_path = PathBuf::from(&destination);  // No validation
    // ...
}
```

---

#### B03: `move_to_trash` accepts raw paths without validation
**File:** `src-tauri/src/lib.rs:458-463`

Paths are passed directly to `trash::delete` without canonicalization:

```rust
fn move_to_trash(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        trash::delete(&path).map_err(...)?;  // Raw path
    }
    Ok(())
}
```

---

#### B04: `open_terminal` on Windows vulnerable to cmd.exe metacharacters
**File:** `src-tauri/src/lib.rs:1481`

The Windows terminal command strips double quotes but doesn't handle other
cmd.exe metacharacters:

```rust
format!("cd /d \"{}\"", path.replace("\"", ""))
```

Characters like `&`, `|`, `>`, `<`, `^` in a directory name could break out
of the `cd` command context. For example, a folder named `test&calc` would
execute `cd /d "test` followed by `calc"` as a separate command.

---

#### B05: `open_powershell_admin` sanitization is incomplete
**File:** `src-tauri/src/lib.rs:1492-1493`

Only `"` and `'` are stripped from the path. PowerShell interprets backticks
(`` ` ``), `$`, and `;` as special characters that could allow command
injection through crafted directory names.

---

### Logic Bugs

#### B06: `move_entry` (legacy) fails on cross-device moves
**File:** `src-tauri/src/lib.rs:778-786`

The legacy `move_entry` uses only `fs::rename`, which fails when source and
destination are on different filesystems (returns `EXDEV` error). The newer
`move_with_progress` handles this with a copy+delete fallback, but
`move_entry` does not:

```rust
fn move_entry(source: String, destination: String) -> Result<String, String> {
    // ...
    fs::rename(&source_path, &final_dest)  // Fails across filesystems
        .map_err(|e| format!("Failed to move: {}", e))?;
    Ok(...)
}
```

---

#### B07: `getParentPath` returns wrong result for Windows paths
**File:** `frontend/js/utils.js:147-162`

For the path `C:\Users`, after splitting and popping:
- `parts` = `['C:']`
- Returns `'C:'` (missing trailing backslash)

The caller (`goUp`) then navigates to `C:` instead of `C:\`, which may not
resolve correctly as a directory path on Windows.

---

#### B08: Drag-and-drop `JSON.parse` can throw uncaught exception
**File:** `frontend/js/events.js:449`

The drop handler parses transferred data without error handling:

```javascript
const data = e.dataTransfer.getData('application/json');
if (data) {
    const sources = JSON.parse(data);  // Can throw
```

If another application drops non-JSON data, this crashes the drop handler and
the `state.draggedItems` / `state.isDragging` cleanup at lines 457-458 never
runs, leaving drag state corrupted.

---

#### B09: Progress dialog may never be hidden after paste
**File:** `frontend/js/app.js:250-269`

The `paste()` action calls `ui.showProgressDialog()` but relies entirely on
the `onOperationProgress` event listener to hide it. There is no explicit
`ui.hideProgressDialog()` after the `await` resolves:

```javascript
async paste() {
    ui.showProgressDialog(action === 'copy' ? 'Copying...' : 'Moving...');
    try {
        if (action === 'copy') {
            await api.copyWithProgress(sources, destination);
            // No hideProgressDialog() here
        }
    } catch (error) {
        ui.showError(error);
        // No hideProgressDialog() here either
    }
}
```

If the Tauri event is delivered after the Promise resolves, or if it's lost
entirely, the progress dialog stays visible indefinitely. The `catch` branch
also fails to hide the dialog.

---

#### B10: `_savedEntries` not in initial state definition
**File:** `frontend/js/app.js:535-536`

Search saves original entries as `state._savedEntries`, but this property
isn't declared in `initialState` (state.js). This means:
- `resetState()` won't clear it, leaving stale data
- It won't be caught by any state change listener logic

---

#### B11: Tab and bookmark ID collision risk
**File:** `frontend/js/ui/tabs.js:46`, `frontend/js/state.js:221`

Both use `Date.now()` for ID generation:
```javascript
const id = 'tab_' + Date.now();
```

If two tabs (or bookmarks) are created within the same millisecond (e.g.,
restoring session state, or programmatic creation), they get identical IDs.
This causes the wrong tab to be closed or switched to.

---

#### B12: Event listener leak on search results header
**File:** `frontend/js/app.js:941`

Every call to `updateSearchHeader()` adds a new click listener to the clear
button via `addEventListener`, but the header element is reused (its
`innerHTML` is replaced). While replacing `innerHTML` destroys the old
button and its listeners, if the implementation changes to update text
content instead, listeners would accumulate.

More importantly, `addEventListener` is called every time search results
update, even though the button is recreated. This is wasteful but not
currently leaking due to innerHTML replacement.

---

#### B13: Reactive proxy doesn't fire for array/collection mutations
**File:** `frontend/js/state.js:93-111`

The Proxy `set` trap only fires on direct property assignment. These common
patterns do NOT trigger state change listeners:

- `state.tabs.push(tab)` — used in tabs.js:57
- `state.tabs.splice(index, 1)` — used in tabs.js:98
- `state.selectedEntries.splice(idx, 1)` — used in app.js:130
- `state.selectedEntries.push(path)` — used in app.js:132
- `state.bookmarks.push(...)` — used in state.js:220
- `state.bookmarks.splice(index, 1)` — used in state.js:232
- `state.treeExpanded.add(path)` — used in tree-view.js
- `state.history.push(path)` — used in app.js:58

Any code subscribing to state changes via `subscribe()` will miss these
mutations. Currently, the app works because it manually calls render
functions after mutations, but the reactive state system is essentially
broken for collections.

---

### Performance Issues

#### B14: `count_items` and `calculate_size_recursive` risk stack overflow
**File:** `src-tauri/src/lib.rs:690-699, 995-1005`

Both functions use unbounded recursion to traverse directory trees:

```rust
fn count_items(path: &PathBuf) -> u64 {
    if path.is_file() { return 1; }
    let mut count = 1u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            count += count_items(&entry.path());  // Unbounded recursion
        }
    }
    count
}
```

A deeply nested directory structure (e.g., `node_modules` chains or malicious
symlink loops) could overflow the stack. `calculate_size_recursive` also
doesn't account for symlink cycles.

---

#### B15: `read_file_preview` reads entire file for binary detection
**File:** `src-tauri/src/lib.rs:1044-1045`

For unknown file extensions under `max_preview_size` (default 1MB), the
entire file is read into memory just to check the first 8000 bytes for
binary content:

```rust
if let Ok(content) = fs::read(&path_buf) {  // Reads up to 1MB
    if content.iter().take(8000).all(|&b| ...)  // Only checks 8000 bytes
```

This wastes memory for files between 8KB and 1MB. Should read only the first
8KB instead.

---

#### B16: macOS and Linux drives report 0 disk space
**File:** `src-tauri/src/lib.rs:216-265`

On macOS and Linux, the `DriveInfo` structs always have `total_space: 0` and
`free_space: 0`. Only Windows implements disk space queries via
`GetDiskFreeSpaceExW`. This means any UI showing drive capacity will display
incorrect information on non-Windows platforms.

---

#### B17: `generate_thumbnail` dimension calculation is redundant
**File:** `src-tauri/src/lib.rs:1093-1097`

The function manually calculates scaled dimensions, then passes them to
`img.thumbnail()` which also handles aspect ratio preservation internally:

```rust
let ratio = (thumb_size as f64) / (width.max(height) as f64);
let new_width = ((width as f64) * ratio) as u32;
let new_height = ((height as f64) * ratio) as u32;
let thumbnail = img.thumbnail(new_width.max(1), new_height.max(1));
```

The pre-calculation and the library's internal calculation may produce
different results due to floating-point rounding, potentially creating
slightly distorted thumbnails. Should just pass `thumb_size` to both
dimensions and let the library handle aspect ratio.

---

#### B18: Linux hardcoded mount points miss modern setups
**File:** `src-tauri/src/lib.rs:234-264`

Linux drive listing only checks `/`, `/home`, `/mnt`, `/media` and
subdirectories of `/mnt` and `/media`. Modern Linux distros (especially
those using `udisks2`) mount removable media at `/run/media/$USER/`, which
is never checked. Custom mount points in `/srv`, `/opt`, or elsewhere are
also missed.

---

#### B19: File watcher 2-second debounce drops legitimate events
**File:** `src-tauri/src/lib.rs:310-318`

The debounce is global per watcher — ANY event within 2 seconds of the last
emitted event is dropped, regardless of which file changed:

```rust
if now.duration_since(*last).as_millis() < 2000 {
    return;  // All events dropped for 2 seconds
}
```

If a user creates file A, then creates file B 1.5 seconds later, the change
event for file B is silently dropped. The directory listing will be stale
until the next manual refresh or until another event arrives after the
debounce window.

---

#### B20: `createElement` utility allows raw innerHTML
**File:** `frontend/js/utils.js:274-287`

The helper function accepts `innerHTML` as a special attribute:

```javascript
} else if (key === 'innerHTML') {
    el.innerHTML = value;  // Potential XSS vector
}
```

If any caller passes user-controlled data through this attribute without
escaping, it creates an XSS vulnerability. While not currently exploited,
it's a dangerous API surface.

---

## Fix Status

All high-risk bugs from the original reports have been fixed or explicitly deferred. The
TOCTOU race from the prior report was also fixed. Here is the current fix summary:

| Bug | Fix Applied |
|-----|-------------|
| B01 | `get_entry_info` now uses `validate_existing_path()` |
| B02 | `copy_entry`/`move_entry` now validate both source and destination |
| B03 | `move_to_trash` now validates and canonicalizes paths |
| B04 | Terminal launching now uses backend process commands with separated arguments instead of shell interpolation |
| B05 | PowerShell admin launch now uses an encoded command with a literal path |
| B06 | `move_entry` now falls back to copy+delete on rename failure |
| B07 | `getParentPath` now preserves trailing backslash for Windows drive roots |
| B08 | Drop handler now wraps `JSON.parse` in try-catch |
| B09 | `paste()`, `copyTo()`, `moveTo()` now call `hideProgressDialog()` on error |
| B10 | `_savedEntries` added to `initialState` |
| B11 | New `uniqueId()` function with monotonic counter for tab/bookmark IDs |
| B12 | (No longer leaks due to innerHTML replacement; documented as non-issue) |
| B13 | All `.push()`/`.splice()` mutations replaced with assignment (`=`) patterns |
| B14 | `count_items` and `calculate_size_recursive` converted to iterative stacks |
| B15 | `read_file_preview` now reads only first 8KB for binary detection |
| B16 | (Deferred — requires adding `libc` dependency for `statvfs` calls) |
| B17 | Removed redundant dimension pre-calculation; `thumbnail()` handles it |
| B18 | Added `/run/media/$USER` scanning for Linux drive listing |
| B19 | Changed from global 2s debounce to per-path 500ms debounce with eviction |
| B20 | Removed `innerHTML` branch from `createElement` utility |
| Old #12 | `create_file` now uses `OpenOptions::create_new()` (atomic) |

Additional 2026-05-24 reliability fixes:

| Area | Fix Applied |
|------|-------------|
| rclone/WinFsp cloud mounts | Known mounted cloud folders are listed through `rclone lsjson` instead of direct `read_dir` calls |
| rclone/WinFsp freezes | Watchers, automatic previews, thumbnails, folder-size scans, detailed properties, drive-space probes, and root liveness probes are skipped for known cloud mounts |
| Windows cloud mount location | rclone mounts use persisted drive letters instead of app-data folders |
| WinFsp installation | Settings exposes a separate WinFsp driver installer/status check with explanatory text |
| Disk cleanup | Long scans emit progress, can be cancelled, and report large files plus duplicate SHA-256 groups |
| Tauri command wiring | `npm run check:invokes` detects frontend invokes without backend handlers |
