# SimpleFile — Feature Opportunity Analysis

A fresh, comprehensive analysis of the SimpleFile codebase identifying concrete opportunities
to add features that would be useful in a file manager. Each item includes a rationale,
complexity estimate, and notes on where it would integrate into the existing architecture.

**Maintenance update - 2026-05-26:** This document is now historical planning input, not a
current implementation backlog. Several opportunities below have landed as prototype features or
were deliberately changed:

| Item | Current status |
|------|----------------|
| Batch Rename | Implemented as the Advanced Rename workflow with recursive file targeting, filters, templates, regex operations, cleanup transforms, and live preview validation |
| Duplicate File Finder | Partially implemented through Disk Cleanup duplicate SHA-256 grouping |
| File Checksum / Hashing | Implemented in properties with MD5, SHA-1, and SHA-256 support |
| Quick Filter Bar | Implemented |
| Open With | MVP implemented with trusted application launching and shell/runtime denylist |
| Quick Access Shortcuts | Implemented |
| Path Bar Autocomplete | Implemented |
| External Drag-and-Drop | Partially implemented for app/desktop payloads and OS-to-app drops |
| Column View | Removed from the active plan; tree/sidebar and dual pane cover the use case |
| File Tagging / Color Labels | Implemented as persistent color labels |
| Split View File Comparison | Implemented as Compare Files for two selected UTF-8 text files |
| Folder Size Column in List View | Implemented with optional background sizing for rendered directory rows |
| Status Bar Disk Space Indicator | Implemented with free/total text and a visual usage meter |
| Clipboard History | Implemented |
| Image EXIF Metadata | Implemented |
| Configurable Columns | Implemented for visible list columns, a header-only right-click column menu, and resizable column widths |

New cloud-drive work that was not in the original list is documented in
[`CLOUD_DRIVES.md`](CLOUD_DRIVES.md): rclone-backed provider panels, WinFsp installation,
Windows drive-letter mounts, and WinFsp freeze safeguards.

---

## Table of Contents

1. [Batch Rename](#1-batch-rename)
2. [Duplicate File Finder](#2-duplicate-file-finder)
3. [File Checksum / Hashing](#3-file-checksum--hashing)
4. [Quick Filter Bar (Type-to-Filter)](#4-quick-filter-bar-type-to-filter)
5. [Folder Size Column in List View](#5-folder-size-column-in-list-view)
6. [Disk Usage Visualization](#6-disk-usage-visualization)
7. [Symlink Support (Create, Display Targets)](#7-symlink-support-create-display-targets)
8. [File Permissions Display & Editing](#8-file-permissions-display--editing)
9. [Undo / Redo for File Operations](#9-undo--redo-for-file-operations)
10. [Open With (Choose Application)](#10-open-with-choose-application)
11. [Quick Access Shortcuts in Sidebar](#11-quick-access-shortcuts-in-sidebar)
12. [Path Bar Autocomplete](#12-path-bar-autocomplete)
13. [Drag-and-Drop to External Apps / Desktop](#13-drag-and-drop-to-external-apps--desktop)
14. [Column View (Miller Columns)](#14-column-view-miller-columns)
15. [File Tagging / Color Labels](#15-file-tagging--color-labels)
16. [Split View File Comparison](#16-split-view-file-comparison)
17. [Status Bar Disk Space Indicator](#17-status-bar-disk-space-indicator)
18. [Clipboard History](#18-clipboard-history)
19. [Image EXIF Metadata in Preview / Properties](#19-image-exif-metadata-in-preview--properties)
20. [Configurable Columns](#20-configurable-columns)

---

## 1. Batch Rename

**What:** Allow users to rename multiple selected files at once using patterns, find-and-replace,
sequential numbering, or regex substitution.

**Why this matters:** Batch rename is one of the most-requested power-user features in any file
manager. Currently, SimpleFile only supports renaming a single file at a time via `renameSelected()`
in `app.js`, which calls `api.renameEntry()` for one path. Users dealing with photo collections,
log files, or any bulk-imported content frequently need to rename dozens of files in one operation.

**Where it integrates:**
- **Backend (`lib.rs`):** Add a new Tauri command `batch_rename(entries: Vec<(String, String)>)` that
  accepts a list of (old_path, new_name) pairs and renames them transactionally (or with rollback on
  failure). Reuse `validate_name()` and `validate_existing_path()`.
- **Frontend (`app.js`):** New function `batchRename()` that opens a dialog when multiple items are
  selected.
- **Frontend (`dialogs.js`):** New dialog with a pattern input (e.g., `Photo_###`, find/replace
  fields), live preview of resulting names, and confirm/cancel buttons.
- **Context menu (`index.html`):** Add "Batch Rename..." option, visible only when multiple items are
  selected.
- **Keyboard shortcut:** Ctrl+Shift+F2 (extending the existing F2 for single rename).

**Complexity:** Medium. The backend is straightforward (loop over renames). The dialog with live
preview and pattern parsing is the main work.

---

## 2. Duplicate File Finder

**What:** Scan a directory (optionally recursively) and identify files with identical content,
grouping them for review and optional deletion.

**Why this matters:** Duplicate files waste disk space and cause confusion. This is a standard
feature in file managers like Total Commander, FreeCommander, and Directory Opus. SimpleFile already
has `search_files` and `calculate_folder_size` as precedent for recursive directory scanning.

**Where it integrates:**
- **Backend (`lib.rs`):** New command `find_duplicates(path, recursive, method)` where method is
  "hash" (SHA-256 of file content), "name" (same filename), or "size+hash" (group by size first,
  then hash only size-matching files for performance). Emit progress events using the existing
  `ProgressUpdate` pattern. The `walkdir` crate is already a dependency.
- **Frontend (`app.js`):** New function `findDuplicates()` triggered from a toolbar button or menu.
- **Frontend (`dialogs.js`):** Results dialog showing groups of duplicate files with checkboxes for
  selecting which to delete/move.
- **State (`state.js`):** New `duplicateResults` property.

**Complexity:** Medium-high. The hashing logic needs to be efficient (read files in chunks, skip
large files optionally). The results UI needs grouping and bulk-action support.

---

## 3. File Checksum / Hashing

**What:** Calculate and display MD5, SHA-1, and/or SHA-256 checksums for selected files. Optionally
verify a file against a provided checksum.

**Why this matters:** Verifying file integrity after downloads or transfers is a common need.
Currently, the properties dialog (`showProperties()` in `app.js`) shows name, path, size, modified
date, and type — but no checksums.

**Where it integrates:**
- **Backend (`lib.rs`):** New command `calculate_checksum(path, algorithm)` returning the hex string.
  Use `sha2` or `md-5` crates. For large files, stream the file in chunks and optionally emit
  progress.
- **Frontend (`dialogs.js`):** Extend the properties dialog to add a "Checksums" section with a
  "Calculate" button (since hashing can be slow for large files, it should be on-demand).
- **Context menu:** Add "Copy Checksum" submenu for quick access.

**Complexity:** Low-medium. The hashing itself is simple. Adding it to the properties dialog is
minimal UI work.

---

## 4. Quick Filter Bar (Type-to-Filter)

**What:** A filter input that instantly narrows the current directory listing as the user types,
without performing a recursive search. Different from the existing search which searches
subdirectories.

**Why this matters:** The existing search (`Ctrl+F`) in `app.js` calls `api.searchFiles()` which
performs a recursive backend search up to 10 levels deep and replaces `state.entries` with results.
There is no way to quickly filter the current flat listing. The `handleTypeAhead()` function in
`app.js` only jumps to the first matching item — it doesn't filter. A quick filter is essential for
directories with hundreds of files.

**Where it integrates:**
- **Frontend only** — no backend changes needed. This is purely a client-side filter on
  `state.entries`.
- **State (`state.js`):** Add `filterText` property.
- **UI (`file-list.js`):** Modify `updateFilteredEntries()` to also filter by `state.filterText`
  matching against entry names.
- **UI (`index.html`):** Add a filter input bar above the file list (or repurpose the existing
  search bar with a toggle between "filter" and "search" modes).
- **Keyboard shortcut:** `/` key (common convention from Vim and many file managers) or `Ctrl+Shift+F`.

**Complexity:** Low. This is entirely frontend and mostly involves adding a text input that updates
`state.filterText` and triggers `updateFilteredEntries()`.

---

## 5. Folder Size Column in List View

**What:** Show calculated sizes for directories directly in the list view size column, either
on-demand or with background calculation.

**Current status:** Implemented with the existing folder-size backend command, optional automatic
background sizing for rendered directory rows, and a settings toggle for users who prefer to avoid
recursive size scans.

**Why this matters:** The original gap was that directory rows did not proactively show their
calculated size even though the backend already had `calculate_folder_size()`. Showing folder sizes
inline makes the list view much more informative.

**Where it integrates:**
- **Frontend (`app.js`):** After `navigateTo()` completes, kick off background folder size
  calculations for visible directories, storing results in `state.folderSizes`.
- **Frontend (`file-list.js`):** In `renderFileItem()`, check `state.folderSizes` for directory
  entries and display the size (or a spinner/placeholder while calculating).
- **Backend (`lib.rs`):** Consider a batched version `calculate_folder_sizes(paths)` to reduce
  IPC overhead, or use the existing single-path command in parallel from the frontend.
- **Settings (`state.js`):** Add `settings.showFolderSizes` toggle since this can be slow on
  directories with many subdirectories.

**Complexity:** Low-medium. The plumbing exists; the main work is background calculation
orchestration and incremental UI updates.

---

## 6. Disk Usage Visualization

**What:** A treemap or sunburst chart showing relative sizes of files and folders in the current
directory, helping users identify what's consuming disk space.

**Why this matters:** This is a feature found in tools like WinDirStat, Baobab (GNOME Disk Usage
Analyzer), and SpaceSniffer. SimpleFile already calculates folder sizes recursively. Presenting
this data visually helps users quickly spot large files and clean up disk space.

**Where it integrates:**
- **Backend (`lib.rs`):** New command `get_disk_usage_tree(path, depth)` that returns a nested
  structure of directories with their sizes, limited to a configurable depth.
- **Frontend:** New view mode or dialog. Could be implemented with an HTML5 Canvas treemap or
  simple nested colored rectangles using CSS grid.
- **Toolbar:** New "Disk Usage" button or menu item.
- **State:** `diskUsageData` property.

**Complexity:** Medium-high. The backend scan is straightforward (extends existing
`calculate_size_recursive`). The treemap visualization is the main effort, though simple CSS-based
versions can be done without a charting library.

---

## 7. Symlink Support (Create, Display Targets)

**What:** Display symlink targets in the file list, allow creating symlinks, and visually
distinguish symlinks from regular files/folders.

**Why this matters:** The current `FileEntry` struct in `lib.rs` has no symlink awareness.
`get_file_entry()` uses `fs::metadata()` which follows symlinks transparently, so a symlink to a
directory shows as a directory with no indication it's a link. On Linux and macOS, symlinks are
extremely common. Users need to see what's a link and where it points.

**Where it integrates:**
- **Backend (`lib.rs`):** Add `is_symlink: bool` and `symlink_target: Option<String>` to
  `FileEntry`. Use `fs::symlink_metadata()` to detect symlinks, then `fs::read_link()` to get the
  target. Add `create_symlink(target, link_path)` command.
- **Frontend (`file-list.js`):** Show a link overlay icon (e.g., arrow badge) on symlink entries.
  Display the target path in a tooltip or in the type column.
- **Frontend (`utils.js`):** New icon or badge for symlinks.
- **Context menu:** Add "Create Symlink" option.

**Complexity:** Low-medium. Backend changes are small. Frontend needs minor rendering adjustments.

---

## 8. File Permissions Display & Editing

**What:** Show Unix file permissions (rwxrwxrwx / octal) in the properties dialog and optionally
in a list view column. Allow changing permissions on Linux/macOS.

**Why this matters:** File permissions are fundamental on Unix systems. The current properties
dialog shows only name, path, size, modified, and type. No permission information is surfaced
anywhere.

**Where it integrates:**
- **Backend (`lib.rs`):** Add `permissions: Option<String>` to `FileEntry` (formatted as "rwxr-xr-x"
  or "755"). New command `set_permissions(path, mode)` using `std::fs::set_permissions()`. On
  Windows, this would show read-only status.
- **Frontend (`dialogs.js`):** Extend properties dialog with a permissions section showing the
  permission string with optional editing (checkboxes for owner/group/other read/write/execute).
- **Frontend (`file-list.js`):** Optional permissions column in list view.

**Complexity:** Low-medium. Reading permissions is trivial. The editing UI with checkboxes mapping
to octal values is moderate work.

---

## 9. Undo / Redo for File Operations

**What:** Maintain a history of file operations (rename, move, copy, delete-to-trash) and allow
undoing/redoing them with Ctrl+Z / Ctrl+Shift+Z.

**Why this matters:** Accidental renames, moves, and deletions are common. Most modern file managers
(Nautilus, Finder, Windows Explorer) support undo. SimpleFile currently has no operation history.
The `move_to_trash()` function provides some safety for deletions, but there's no way to undo a
rename or move.

**Where it integrates:**
- **State (`state.js`):** New `operationHistory` array and `operationHistoryIndex`.
- **Frontend (`app.js`):** Each mutating operation (rename, move, copy, trash) pushes an undo entry
  to the history. New `undo()` and `redo()` functions that reverse operations.
- **Backend (`lib.rs`):** No new commands needed — undo uses existing rename/move/copy/trash-restore
  commands. May need a `restore_from_trash(original_path)` command if the `trash` crate supports it.
- **Keyboard shortcuts (`events.js`):** Ctrl+Z for undo, Ctrl+Shift+Z for redo.

**Complexity:** Medium. The main challenge is handling edge cases (files modified between operation
and undo, destination no longer exists, etc.) and supporting undo for trash operations.

---

## 10. Open With (Choose Application)

**What:** Right-click a file and choose which application to open it with, instead of always using
the system default.

**Why this matters:** `openFile()` in `app.js` calls `api.openFile()` which uses Tauri's shell
opener, always opening with the system default. Users often want to open a `.txt` in a code editor
instead of Notepad, or a `.png` in GIMP instead of the default viewer.

**Where it integrates:**
- **Backend (`lib.rs`):** New command `open_file_with(path, application)` that spawns the specified
  application with the file as an argument. On Linux, could list `.desktop` files. On macOS, use
  `open -a`. On Windows, use shell execute with explicit program.
- **Backend (`lib.rs`):** New command `list_applications_for(path)` that returns available
  applications for a file type (platform-specific).
- **Context menu (`index.html`):** Add "Open With..." submenu item.
- **Frontend (`dialogs.js`):** Application chooser dialog listing detected applications.

**Complexity:** Medium-high. The platform-specific application discovery is the hard part.
A simpler version could just provide a text input for the application path.

---

## 11. Quick Access Shortcuts in Sidebar

**What:** Add a permanent "Quick Access" section at the top of the sidebar with links to standard
user directories: Home, Desktop, Documents, Downloads, Pictures, Music, Videos.

**Why this matters:** The sidebar currently shows bookmarks (user-added), the folder tree, and
recent locations. But there are no built-in shortcuts to standard directories. Every major file
manager (Finder, Nautilus, Windows Explorer, Dolphin) has these. The `dirs` or `directories` crate
can provide these paths cross-platform.

**Where it integrates:**
- **Backend (`lib.rs`):** New command `get_standard_directories()` returning a map of standard
  directory names to paths. Use the `dirs` crate (or manual env var lookups, since `dirs_home()`
  already exists).
- **Frontend (`index.html`):** New sidebar section above bookmarks with fixed entries.
- **State (`state.js`):** New `standardDirs` property populated at startup.
- **Frontend (`app.js`):** Populate during `init()`.

**Complexity:** Low. This is straightforward on all platforms and the sidebar rendering pattern
already exists in the bookmarks section.

---

## 12. Path Bar Autocomplete

**What:** When the user clicks the path bar (Ctrl+L) and starts typing, show autocomplete
suggestions based on existing directories.

**Why this matters:** The path input (`path-input` element) currently accepts free-text input and
navigates on Enter. There is no autocomplete. Users must type complete paths from memory. Every
modern file manager and terminal provides path completion.

**Where it integrates:**
- **Backend (`lib.rs`):** New command `autocomplete_path(partial_path)` that lists matching
  directories in the parent of the partial path. E.g., typing `/home/user/Do` returns
  `["/home/user/Documents", "/home/user/Downloads"]`.
- **Frontend (`breadcrumb.js`):** Add autocomplete dropdown below the path input. Listen for input
  events, debounce, call backend, render suggestions.
- **Keyboard:** Tab to accept first suggestion, arrow keys to navigate suggestions, Escape to
  dismiss.

**Complexity:** Medium. The backend is simple. The autocomplete dropdown with keyboard navigation
needs careful UX work.

---

## 13. Drag-and-Drop to External Apps / Desktop

**What:** Enable dragging files from SimpleFile to the desktop or other applications (and vice
versa, dragging files from the desktop into SimpleFile).

**Why this matters:** The current drag-and-drop system in `events.js` is internal only — it handles
dragging between the file list and the dual pane, or onto directories within SimpleFile. There is no
integration with the OS drag-and-drop system. Users expect to be able to drag a file from a file
manager to their email client, text editor, or desktop.

**Where it integrates:**
- This is a Tauri/WebView limitation. Tauri 2 has evolving support for native drag-and-drop. The
  `tauri-plugin-drag` or `startDragging` API would need to be investigated.
- **Frontend (`events.js`):** The `dragstart` handler currently uses internal data transfer. It
  would need to set proper `dataTransfer` types (`text/uri-list`, `Files`) with file:// URIs.
- **Backend:** May need a Tauri plugin or custom implementation depending on platform support.

**Complexity:** High. This depends heavily on Tauri 2's native DnD capabilities and may require
platform-specific code.

---

## 14. Column View (Miller Columns)

**What:** A third view mode (alongside list and grid) showing a hierarchy of columns, where
selecting a folder opens its contents in the next column to the right.

**Why this matters:** Column view (originated in NeXTSTEP, popularized by macOS Finder) is excellent
for navigating deep directory structures. It shows the full path context at a glance. SimpleFile
currently has list view, grid view, and dual-pane — but no column view.

**Where it integrates:**
- **Frontend:** New view mode. The `content-area` would render multiple scrollable columns, each
  showing a directory listing. Selecting a directory in column N populates column N+1.
- **State (`state.js`):** New `columnViewPaths` array tracking the path for each visible column.
- **Events (`events.js`):** Column-specific click handlers and keyboard navigation (left/right
  arrows to move between columns).
- **Backend:** No changes needed — uses existing `list_directory()`.

**Complexity:** Medium-high. The multi-column layout with horizontal scrolling, proper focus
management, and keyboard navigation is significant UI work.

---

## 15. File Tagging / Color Labels

**What:** Allow users to assign color labels or text tags to files and directories, and filter by
tag.

**Why this matters:** macOS Finder has color tags, Dolphin has ratings, and many file managers
support metadata tagging. This helps users organize files beyond the rigid folder hierarchy.

**Where it integrates:**
- **Storage:** Tags need persistent storage. Options: (a) a local SQLite database mapping paths to
  tags, (b) a JSON file in the app's data directory, or (c) extended file attributes (xattr) for
  OS-native integration. Option (b) is simplest for a cross-platform MVP.
- **Backend (`lib.rs`):** New commands `set_tags(path, tags)`, `get_tags(path)`,
  `get_all_tags()`, `search_by_tag(tag)`. Add `serde_json` for storage (already a dependency
  through serde).
- **Frontend (`file-list.js`):** Render color dots or tag badges next to file names.
- **Context menu:** "Set Label..." submenu with color options.
- **Sidebar:** Optional "Tags" section showing all tags with click-to-filter.

**Complexity:** Medium. The tag storage and CRUD is simple. The UI integration across list view,
grid view, context menu, and sidebar filtering is moderate.

---

## 16. Split View File Comparison

**What:** Select two UTF-8 text files and compare them side-by-side with line-level differences.

**Current status:** Implemented in v1.0.2 as the **Compare Files** action for exactly two selected
files. Binary files and oversized inputs are rejected with clear errors instead of being guessed at.

**Why this matters:** File comparison is a common need when dealing with multiple versions of
documents or code files. While dedicated diff tools exist, having a basic comparison built into the
file manager saves the context switch.

**Where it integrates:**
- **Backend (`compare.rs`, registered from `lib.rs`):** `compare_files(path_a, path_b)` returns
  bounded line-level diff data for UTF-8 text files.
- **Frontend:** Side-by-side modal showing matched, added, removed, and changed lines.
- **Context menu:** "Compare Files" option when exactly 2 files are selected.
- **Keyboard shortcut:** Ctrl+= when 2 files are selected.

**Complexity:** MVP complete. Future polish could add binary metadata comparison, syntax
highlighting, larger-file UX, or external diff-tool handoff.

---

## 17. Status Bar Disk Space Indicator

**What:** Show the free/total disk space for the current drive in the status bar, with a visual
usage bar.

**Current status:** Implemented with current-drive matching, free/total space text, a visual usage
meter, and a narrow-viewport layout that hides the meter when there is not enough room.

**Why this matters:** The original gap was that the status bar (`status-bar` element) had item,
selection, and path context but did not visualize the `DriveInfo` `total_space` and `free_space`
already returned by `list_drives()`.

**Where it integrates:**
- **Frontend (`breadcrumb.js`):** In `updateStatusBar()`, add a disk usage indicator. Query
  `state.drives` to find the drive matching the current path.
- **Frontend (`index.html`):** Add a `<span>` in the status bar for disk info, potentially with a
  small CSS progress bar.
- **State:** Drive info is already loaded at startup into `state.drives`.
- No backend changes needed — the data is already available.

**Complexity:** Low. The data exists; this is purely a rendering task.

---

## 18. Clipboard History

**What:** Track the last N clipboard operations (copy/cut) and allow users to paste from any
previous entry, not just the most recent.

**Why this matters:** When copying files from multiple locations to assemble in one place, users
currently lose their clipboard each time they copy something new. A clipboard history ring would
let them copy from location A, navigate to location B, copy more files, then paste all of them.

**Where it integrates:**
- **State (`state.js`):** New `clipboardHistory` array (with configurable max length, e.g., 10).
- **Frontend (`app.js`):** Modify `copy()` and `cut()` to push to history in addition to setting
  `state.clipboard`. New `pasteFromHistory(index)` function.
- **UI:** Dropdown or popover accessible from a toolbar button or `Ctrl+Shift+V` showing recent
  clipboard entries.

**Complexity:** Low. This is entirely frontend state management.

---

## 19. Image EXIF Metadata in Preview / Properties

**What:** For image files, extract and display EXIF metadata (camera model, date taken, dimensions,
GPS coordinates, exposure settings) in the preview pane and properties dialog.

**Why this matters:** The preview pane (`showQuickLook()`) currently shows images as thumbnails and
text files as content. No metadata beyond basic file info is shown. Photographers and anyone
working with photos needs to see EXIF data.

**Where it integrates:**
- **Backend (`lib.rs`):** New command `get_image_metadata(path)` using the `kamadak-exif` or `rexif`
  crate to extract EXIF tags. Return a structured object with common fields.
- **Frontend (`dialogs.js`):** Extend quick look and properties dialogs to show metadata for image
  files (dimensions, camera, date, ISO, aperture, etc.).
- **Frontend (`file-list.js`):** Optionally show image dimensions in the type column for image files.

**Complexity:** Low-medium. The `image` crate is already a dependency. Adding an EXIF reader is a
small dependency addition. UI changes are moderate.

---

## 20. Configurable Columns

**What:** Let users choose which columns are visible in list view and their order.
Available columns could include: Name, Size, Type, Date Modified, Date Created, Permissions,
Owner, Extension.

**Why this matters:** The list view currently has four fixed columns: Name, Size, Date Modified,
Type. Power users want to customize which columns are visible. For example, on a codebase they
might want extension and permissions; for photos they might want date created and dimensions.

**Where it integrates:**
- **Backend (`lib.rs`):** Extend `FileEntry` with additional optional fields: `created`,
  `permissions`, `owner`. Populate these conditionally based on what the frontend requests.
- **State (`state.js`):** New `settings.visibleColumns` array and `settings.columnOrder` array.
- **Frontend (`file-list.js`):** Dynamic column rendering based on configuration. Modify
  `renderFileItem()` and the header row to iterate over configured columns.
- **Frontend (`dialogs.js`):** Column configuration dialog accessible from right-clicking the
  column header row.
- **Frontend (`utils.js`):** Update `sortEntries()` to handle new sortable fields.

**Complexity:** Medium. The rendering refactor from hardcoded columns to dynamic columns is the
main work.

---

## Priority Recommendations

### High Value, Low Effort (Implement First)
| # | Feature | Rationale |
|---|---------|-----------|
| 4 | Quick Filter Bar | Entirely frontend, huge usability win |
| 17 | Status Bar Disk Space | Data already exists, just render it |
| 11 | Quick Access Shortcuts | Trivial backend, familiar UX pattern |
| 3 | File Checksum/Hashing | Simple backend addition to properties |

### High Value, Medium Effort
| # | Feature | Rationale |
|---|---------|-----------|
| 1 | Batch Rename | Top power-user request for any file manager |
| 7 | Symlink Support | Essential for Linux/macOS users |
| 5 | Folder Size Column | Plumbing exists, needs orchestration |
| 9 | Undo/Redo | Major usability and safety improvement |
| 12 | Path Autocomplete | Standard expectation for path input |

### Medium Value, Medium-High Effort
| # | Feature | Rationale |
|---|---------|-----------|
| 8 | File Permissions | Important for Unix, moderate UI work |
| 2 | Duplicate Finder | Useful utility, needs good progress UX |
| 15 | File Tagging | Unique differentiator, needs storage design |
| 18 | Clipboard History | Useful for multi-source workflows |
| 20 | Configurable Columns | Power-user flexibility |

### Ambitious / Differentiating
| # | Feature | Rationale |
|---|---------|-----------|
| 6 | Disk Usage Visualization | High wow-factor, significant UI work |
| 14 | Column View | Unique view mode, substantial implementation |
| 10 | Open With | Platform-specific discovery is complex |
| 16 | File Comparison | Niche but valuable for developers |
| 13 | External Drag-and-Drop | Depends on Tauri 2 DnD capabilities |
| 19 | Image EXIF Metadata | Niche audience, low-medium effort |

---

## Architecture Notes

Several patterns in the existing codebase make these features easier to implement:

1. **Centralized state (`state.js`)** — New features just add properties to the state store.
   The proxy-based reactivity and LocalStorage persistence are already wired up.

2. **Modular frontend** — The `ui/` directory with separate files for dialogs, file-list, tree-view,
   etc. makes it easy to add new UI components without bloating existing files.

3. **Tauri command pattern** — Adding a new backend capability follows a consistent pattern:
   define a struct, write a `#[tauri::command]` function, register it in `src-tauri/src/lib.rs`'s
   `invoke_handler`, and add a wrapper in `api.js`.

4. **Progress event system** — The `ProgressUpdate` struct and event emission pattern can be
   reused for any long-running operation (duplicate finding, bulk rename, disk usage scan).

5. **Existing utilities** — `walkdir` for recursion, `image` for thumbnails, `serde` for
   serialization, `trash` for safe deletion — these cover many of the dependencies needed for
   the proposed features.
