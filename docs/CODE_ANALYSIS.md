# SimpleFile Code Analysis Report

> Historical note: this report reflects the 2026-02-10 / v0.2.0 analysis pass.
> Many items below have since been fixed or superseded. See `BUGS.md`,
> `CHANGELOG.md`, and `UI_BACKEND_REVIEW.md` for the current status.
>
> 2026-05-26 status note: terminal/Open With process launching no longer uses
> `tauri-plugin-shell`. The current release metadata is aligned at v1.1.0, and
> side-by-side text file comparison is available from the file context menu.

Thorough analysis of the SimpleFile codebase identifying potential bugs, security
vulnerabilities, performance issues, and architectural concerns.

**Analysis date:** 2026-02-10
**Analysis baseline version:** 0.2.0
**Current release when last reviewed:** 1.1.0

---

## Critical: Security Vulnerabilities

### 1. Command Injection in Terminal Commands (Windows)
**File:** `src-tauri/src/lib.rs:1481`

The Windows `open_terminal` command strips double quotes but not other shell
metacharacters:

```rust
format!("cd /d \"{}\"", path.replace("\"", ""))
```

A path containing `&`, `|`, `>`, or other cmd.exe metacharacters can break out
of the `cd` command and execute arbitrary commands. For example, a directory
named `foo & calc` would execute `calc`.

Similarly, `open_powershell_admin` (line 1492-1493) only strips quotes:
```rust
let safe_path = path.replace('\"', "").replace('\'', "");
```

Characters like `;`, `` ` ``, `$()`, and `|` are not sanitized and can inject
PowerShell commands.

**Fix:** Use proper argument arrays instead of shell string formatting. For
cmd.exe, escape all metacharacters (`&|><%^`). For PowerShell, use
`-EncodedCommand` with a base64-encoded script, or sanitize all PowerShell
special characters.

---

### 2. Incomplete Tauri v2 Capabilities
**File:** `src-tauri/capabilities/default.json`

The capabilities file only grants:
```json
"permissions": ["core:default", "shell:allow-open", "opener:default"]
```

The backend uses `tauri_plugin_shell::ShellExt` to spawn arbitrary processes
in `open_terminal` and `open_powershell_admin` (spawning `gnome-terminal`,
`konsole`, `cmd`, `powershell`, etc.), which requires `shell:allow-execute`
or similar permissions. The current config only allows `shell:allow-open`.

Depending on Tauri v2's enforcement level, these commands may silently fail or
throw permission errors at runtime.

**Fix:** Add the necessary shell execution permissions to the capabilities file,
scoped to the specific commands needed.

---

### 3. `get_entry_info` Skips Path Validation
**File:** `src-tauri/src/lib.rs:479-485`

Unlike other commands that use `validate_existing_path()` (which canonicalizes
and resolves symlinks), `get_entry_info` constructs a `PathBuf` directly:

```rust
fn get_entry_info(path: String) -> Result<FileEntry, String> {
    let path_buf = PathBuf::from(&path);  // No canonicalization
    if !path_buf.exists() { ... }
    get_file_entry(&path_buf)
}
```

This allows path traversal with `..` components and retrieval of file info
outside the user's intended browsing scope.

**Fix:** Use `validate_existing_path(&path)?` like other commands.

---

### 4. Context Menu Archive Detection Includes Unsupported Formats
**File:** `frontend/js/ui/dialogs.js:94-96`

```javascript
const hasArchiveSelected = state.selectedEntries.some(path => {
    const ext = path.split('.').pop()?.toLowerCase();
    return ['zip', 'tar', 'gz', 'tgz', 'rar', '7z'].includes(ext);
});
```

The `7z` format is listed in the context menu detection but is not supported
by the backend. Clicking "Extract" on a `.7z` file produces an unhelpful
backend error. Standalone `.gz` files (not `.tar.gz`) also match here but fail
in the backend.

**Fix:** Align this list with actual backend support. Remove `7z` and ensure
`.gz` only matches when preceded by `.tar`.

---

## High: Logic Bugs & Data Integrity

### 5. Symlink Loops Cause Stack Overflow in Recursive Operations
**Files:** `src-tauri/src/lib.rs:690-699, 762-775, 701-740, 995-1005`

`count_items`, `copy_dir_recursive`, `copy_with_progress_recursive`, and
`calculate_size_recursive` all follow symlinks during directory traversal via
`fs::read_dir()`:

```rust
fn count_items(path: &PathBuf) -> u64 {
    if path.is_file() { return 1; }
    let mut count = 1u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            count += count_items(&entry.path()); // Follows symlinks
        }
    }
    count
}
```

A symlink loop (e.g., directory `a` containing a symlink to `a`) causes
infinite recursion and a stack overflow, crashing the application.

**Fix:** Track visited inodes/paths during traversal, or use `fs::symlink_metadata`
to detect and skip symlinks. Alternatively, use `walkdir` with
`follow_links(false)` (already used for search but not for copy/move/count).

---

### 6. Large File Reads Into Memory During Archive Creation
**File:** `src-tauri/src/lib.rs:1378-1400`

`create_zip_archive` reads entire files into memory before writing to the
archive:

```rust
let mut buffer = Vec::new();
file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
zip.write_all(&buffer).map_err(|e| e.to_string())?;
```

For large files (multi-GB), this exhausts available memory and crashes.

**Fix:** Use `std::io::copy` to stream data directly from the source file to
the zip writer without buffering the entire file.

---

### 7. Legacy `move_entry` Fails Silently Across Filesystems
**File:** `src-tauri/src/lib.rs:778-786`

```rust
fn move_entry(source: String, destination: String) -> Result<String, String> {
    // ...
    fs::rename(&source_path, &final_dest)
        .map_err(|e| format!("Failed to move: {}", e))?;
}
```

`fs::rename` fails when source and destination are on different filesystems
(returns `EXDEV`). The progress-based `move_with_progress` handles this with
a copy+delete fallback, but the legacy command just returns an error. If any
code path still uses the legacy command, cross-device moves will fail.

**Fix:** Add the same copy+delete fallback, or remove the legacy command and
ensure all callers use `move_with_progress`.

---

### 8. TOCTOU Race in `create_file`
**File:** `src-tauri/src/lib.rs:439-443`

```rust
fn create_file(path: String, name: String) -> Result<String, String> {
    // ...
    if new_path.exists() {            // Check
        return Err("already exists");
    }
    fs::File::create(&new_path)...    // Use — race window
}
```

Between the existence check and `File::create`, another process could create
the same file. Since `File::create` overwrites existing files, this could
silently truncate a file that was created in the race window.

**Fix:** Use `OpenOptions::new().create_new(true).write(true).open()` which
atomically creates the file only if it doesn't exist.

---

### 9. Search State Management Is Fragile
**File:** `frontend/js/app.js:524-580`

Search results overwrite `state.entries` and rely on `state._savedEntries` to
restore:

```javascript
if (!state._savedEntries) {
    state._savedEntries = state.entries;
}
state.entries = results.map(r => ({ ... }));
```

Problems:
- If the user searches, then a watcher-triggered refresh fires (bypassing
  search mode), `state.entries` gets overwritten with directory contents and
  `_savedEntries` still holds the old entries. Clearing search then restores
  stale data.
- Operations like delete/rename on search results look up entries in
  `state.entries`, which now contains results from multiple directories with
  potentially ambiguous paths.
- Performing a second search without clearing the first overwrites
  `state.entries` but doesn't update `_savedEntries` (the guard `if
  (!state._savedEntries)` prevents it), so clearing after multiple searches
  restores the entries from before the *first* search.

**Fix:** Use a separate `state.searchResults` array. Render from
`searchResults` when in search mode, from `entries` otherwise. Never
overwrite `entries` with search results.

---

### 10. Linux Drive Listing Produces Duplicates
**File:** `src-tauri/src/lib.rs:232-265`

```rust
let mount_points = vec!["/", "/home", "/mnt", "/media"];
for mount in mount_points {
    // ... adds /mnt and /media as drives
}
for base in &["/mnt", "/media"] {
    if let Ok(entries) = fs::read_dir(base) {
        // ... also adds subdirectories of /mnt and /media
    }
}
```

If `/mnt` contains a subdirectory `/mnt/data`, the user sees both `/mnt` and
`/mnt/data` as separate "drives." If `/mnt` itself is a mount point, it
appears twice — once from the hardcoded list and potentially again as a
subdirectory enumeration target.

**Fix:** Parse `/proc/mounts` or `/etc/mtab` on Linux to get actual mount
points, or deduplicate the results.

---

## Medium: Performance Issues

### 11. Double Filesystem Traversal for Copy/Move Progress
**File:** `src-tauri/src/lib.rs:502-505`

Before copying, all source paths are fully traversed to count items:
```rust
for src in &sources {
    total_items += count_items(&PathBuf::from(src));
}
```

Then the entire tree is traversed again during the actual copy. For large
directory trees (e.g., `node_modules` with 50,000+ files), this doubles the
I/O time.

**Fix:** Count items during the copy operation itself, emitting progress
updates with an incrementing counter against an estimated or unknown total.

---

### 12. O(n) Selection Lookups on Every Render
**File:** `frontend/js/ui/file-list.js:35, 331-361`

`state.selectedEntries` is an array, and lookups use `.includes(path)` which
is O(n). In `updateSelectionVisuals`, this is called for every visible file
item, making the overall complexity O(items × selectedItems):

```javascript
const isSelected = state.selectedEntries.includes(path);
```

With 1000 files and 500 selected, this performs 500,000 string comparisons.

**Fix:** Use a `Set` for `selectedEntries` or maintain a parallel `Set` for
O(1) lookups.

---

### 13. `escapeHtml` Creates DOM Elements Per Call
**File:** `frontend/js/utils.js:182-187`

```javascript
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

This creates and discards a DOM element for every call. When rendering a file
list of 500 items with ~5 escaped fields each, that's 2500 temporary DOM
elements per render.

**Fix:** Use a string-replacement approach:
```javascript
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
text.replace(/[&<>"']/g, c => escapeMap[c]);
```

---

### 14. Zip Archive Creation Buffers Entire Files
**File:** `src-tauri/src/lib.rs:1388-1393`

As noted in issue #6, `create_zip_archive` uses `read_to_end` which buffers
entire files in memory. Beyond the crash risk for large files, this also means
memory usage scales with the largest file being archived rather than remaining
constant.

---

## Medium: Architectural Concerns

### 15. Reactive State Proxy Doesn't Detect Nested Mutations
**File:** `frontend/js/state.js:93-111`

The Proxy only intercepts direct property assignment on the top-level state
object:

```javascript
return new Proxy(state, {
    set(target, property, value) { ... }
});
```

Mutations like `state.tabs.push(newTab)`, `state.selectedEntries.splice()`,
`state.treeExpanded.add(path)`, or `state.settings.theme = 'light'` do **not**
trigger change listeners. This means any code relying on the reactive system
for arrays, maps, sets, or nested objects will silently fail to react.

Currently this doesn't cause visible bugs because the code doesn't rely on
listeners for these mutations, but it makes the reactive system misleading —
it promises reactivity it can't deliver.

**Fix:** Either deep-proxy nested objects, or document that only top-level
scalar assignments are reactive and adjust code accordingly.

---

### 16. Elements Cached at Module Load Time
**File:** `frontend/js/ui/elements.js`

All DOM element references are captured when the module first loads:
```javascript
export const elements = {
    fileList: document.getElementById('file-list'),
    // ...
};
```

If this module is ever loaded before `DOMContentLoaded` (e.g., through a
bundler that changes execution order), all references become `null`. The code
currently works because ES modules are deferred, but this assumption is
fragile and undocumented.

**Fix:** Use getter functions or lazy initialization, e.g.:
```javascript
get fileList() { return document.getElementById('file-list'); }
```

---

### 17. No Cancellation Support for Search
**File:** `src-tauri/src/lib.rs:855-929`

`search_files` performs synchronous recursive traversal with no cancellation
mechanism. A search in a large directory tree (e.g., `/`) with `max_depth: 10`
and `max_results: 1000` could take many seconds, during which the UI appears
frozen (the Tauri invoke blocks the JS await).

**Fix:** Add cancellation token support similar to `copy_with_progress`, or
run the search in a separate thread with periodic checks.

---

### 18. File Watcher Debounce May Miss Rapid Changes
**File:** `src-tauri/src/lib.rs:310-318`

The watcher uses a 2-second debounce:
```rust
if now.duration_since(*last).as_millis() < 2000 {
    return;
}
```

This means if a file is created, then another is deleted within 2 seconds,
only the first event triggers a refresh. The user must wait 2+ seconds for
subsequent changes to be reflected, or manually refresh.

While this is an intentional tradeoff to prevent refresh loops, a more granular
approach (accumulating events and flushing on a timer) would be more responsive.

---

## Low: Code Quality Issues

### 19. Binary Content Detection Heuristic Is Fragile
**File:** `src-tauri/src/lib.rs:1045`

```rust
if content.iter().take(8000).all(|&b| b != 0 && (b >= 32 || b == 9 || b == 10 || b == 13))
```

This classifies any file with null bytes as binary. UTF-16 encoded text files
(common on Windows) contain null bytes as part of normal encoding and would be
misclassified as binary.

**Fix:** Check for BOM (Byte Order Mark) to detect UTF-16/UTF-32, or use a
more sophisticated content-type detection library.

---

### 20. Duplicate Path Parsing Functions
**Files:** `frontend/js/utils.js:116-131`, `frontend/js/ui/tree-view.js:161-174`

Two identical `parsePath` implementations exist. `tree-view.js` has a local
copy instead of importing from `utils.js`.

**Fix:** Remove the duplicate in `tree-view.js` and import from `utils.js`.

---

### 21. `unwrap()` Calls That Can Panic
**File:** `src-tauri/src/lib.rs:1385-1386, 1433-1434`

In `create_zip_archive` and `create_tar_archive`:
```rust
let name = path.file_name()
    .ok_or_else(|| format!("Cannot get file name for: {}", path_str))?
```

These are properly handled with `ok_or_else`. However, `add_dir_to_zip` at
line 1412 uses `entry.file_name().to_string_lossy()` which is infallible but
doesn't validate the entry. If a directory entry fails to read, `.flatten()`
silently skips it, creating an incomplete archive without warning the user.

---

### 22. No Validation on `max_size` Parameter
**File:** `src-tauri/src/lib.rs:1017`

```rust
fn read_file_preview(path: String, max_size: Option<u64>) -> Result<FilePreview, String> {
    let max_preview_size = max_size.unwrap_or(1024 * 1024);
```

A malicious or buggy frontend could pass an extremely large `max_size` value,
causing the backend to attempt to read gigabytes of file content into memory.

**Fix:** Clamp `max_size` to a reasonable maximum (e.g., 10 MB).

---

### 23. Toast Notifications Can Accumulate
**File:** `frontend/js/ui/file-list.js:287-297`

Error and success toasts are appended to `document.body` with a 3-second
timeout:
```javascript
document.body.appendChild(toast);
setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
}, 3000);
```

While identical errors are debounced within 2 seconds, different rapid errors
(e.g., batch operation failures) can stack up many toasts simultaneously with
no maximum limit, potentially obscuring the UI.

**Fix:** Maintain a toast container with a maximum visible count, removing
oldest toasts when the limit is exceeded.

---

## Summary

| Severity | Count | Categories |
|----------|-------|------------|
| Critical | 4     | Command injection, missing permissions, path validation, format mismatch |
| High     | 6     | Symlink loops, memory exhaustion, cross-device moves, TOCTOU, state management, duplicates |
| Medium   | 8     | Performance (double traversal, O(n) lookups, DOM creation), architecture (proxy, elements, search, watcher) |
| Low      | 5     | Heuristics, duplicates, panics, validation, UI accumulation |
| **Total** | **23** | |

### Previously Identified Issues Now Fixed

The following issues from the previous analysis have been addressed:
- Path traversal in `create_directory`/`create_file` — `validate_name()` added
- Tar/RAR extraction path traversal — canonicalization checks added
- `move_with_progress` silent delete failures — warning emitted to user
- Grid view arrow key navigation — `getGridColumnsPerRow()` implemented
- `selectAll` full re-render — now uses `updateSelectionVisuals()`
- Version mismatch — current release metadata is aligned at 1.1.0
- Updater placeholder values — updater plugin disabled
- Non-unique operation ID — atomic counter added
- Unbounded thumbnail cache — cleared on navigation
- `has_children` always true — now checks for actual subdirectories
- `list_directory` path canonicalization — now uses `validate_existing_path`
- CSP `unsafe-inline` for scripts — only present for styles (acceptable)
