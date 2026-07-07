# SimpleFile Roadmap

This document is the authoritative development plan for SimpleFile. It covers the v1.0.0
release baseline and the follow-up hardening and feature work that will make SimpleFile
a compelling choice over Nautilus, Dolphin, Finder, and Windows Explorer.

---

## Current Status (v1.1.0)

SimpleFile is a functional cross-platform file manager built on Rust/Tauri and has reached
its first v1.0.0 release baseline, with v1.0.1 carrying the signed GitHub-hosted updater
channel, v1.0.2 adding side-by-side text file comparison, v1.0.3 adding configurable
columns, folder item counts, and the active drive-space meter, and v1.1.0 improving mounted-drive transfer progress and responsiveness. The core browsing and file-operation features work. The original bug-analysis items
are mostly fixed, CI/CD is active, release builds are cross-platform, and dependency
resolution is reproducible through the committed Cargo lockfile.

**What works today:**
- File browsing (list and grid views), sortable columns, multi-tab support
- Create, rename, delete (to trash), copy, cut, paste files and folders
- Folder tree sidebar, Quick Access, recent locations, path autocomplete, quick filtering,
  breadcrumb navigation, and keyboard shortcuts
- Archive support (ZIP, TAR, TAR.GZ, TAR.BZ2, RAR)
- File search, file preview (text + image thumbnails), text file comparison, checksums, EXIF metadata, and git status display
- File system watcher (auto-refresh), terminal integration, FTP browsing
- Drag-and-drop, Open With, theming (dark/light), settings persistence, and an About dialog
- Disk cleanup scanning for large files and duplicate SHA-256 groups, with progress and cancellation
- **Cloud storage via plugin system** - Google Drive, pCloud, Microsoft OneDrive, Dropbox,
  and S3-compatible storage use rclone-backed provider panels; adding new providers requires
  minimal shared infrastructure work
- **Windows cloud drive mounts** - rclone-backed mounts use drive letters, can install/check
  WinFsp from Settings, and avoid background WinFsp probes that previously risked app freezes

**What still needs work:**
- Disk space reporting on macOS/Linux still needs a proper `statvfs` / `statfs` implementation.
- Accepted RustSec advisories from the Tauri/Linux GTK stack should be revisited whenever Tauri/Wry move away from those transitive crates.
- Several completed features still need broader cross-platform QA, accessibility review,
  and integration tests as part of ongoing post-1.0 hardening.

## Roadmap Maintenance Note (2026-05-24)

Several items originally listed as future work have landed in the prototype:
Quick Access, quick filter, path autocomplete, checksums, image metadata, Open With,
configurable columns, color labels, undo/redo basics, advanced rename, disk cleanup,
file comparison, external drop handling, Dropbox/S3 rclone support, the transfer manager, WinFsp install
support, Windows rclone drive-letter mounts, and the About dialog.

The phase descriptions below are retained as planning history and should be interpreted as
"harden and complete" where an MVP already exists. After the v1.0.0 tag, the roadmap should
be re-baselined around remaining production gaps: cross-platform QA,
accessibility, performance, signing/updater readiness, and tests for the newer cloud/mount
and process-launch behavior.

---

## Phase 1 — Stability (v0.3.0)

**Goal:** Close all known bugs and harden the codebase before feature work.
**Target:** 4–6 weeks

### 1.1 Remaining Open Issues

These issues were identified during the v0.2.0 analysis but deferred:

| ID | Location | Issue | Fix |
|----|----------|-------|-----|
| R-01 | `src-tauri/src/drives.rs` | macOS/Linux `DriveInfo` always reports 0 disk space | Use `statvfs` (libc) on Unix; `statfs` on macOS |
| R-02 | `frontend/js/state.js` | Reactive proxy behavior for nested collections should remain audited as state grows | Prefer assignment patterns or wrap arrays/sets in a recursive proxy |
| R-05 | `frontend/js/app.js` | O(n) selection lookup with `Array.includes()` may hurt very large selections | Replace `state.selectedEntries` array with a `Set` or maintain a parallel lookup set |
| R-08 | `frontend/js/ui/elements.js` | CSP allows `unsafe-inline` for `style-src` | Migrate dynamic inline styles to CSS classes; tighten CSP |

### 1.2 Test Coverage

- Add Rust unit tests for every `src-tauri/src/*.rs` module that has none
- Add integration tests for the most critical commands: `list_directory`, `copy_with_progress`,
  `move_with_progress`, `create_file`, `move_to_trash`
- Add a frontend smoke test using Playwright + Tauri's test utilities to verify app launch,
  navigation, and basic file operations

### 1.3 Error Handling Audit

- Every `unwrap()` and `expect()` in production Rust code should be replaced with proper error
  propagation via `?` or explicit `map_err`
- Frontend `try/catch` blocks should log errors consistently and never silently swallow them

---

## Phase 2 — Quick Wins (v0.4.0)

**Goal:** High-value features with low implementation cost.
**Target:** 4–6 weeks after Phase 1

### 2.1 Status Bar Disk Space Indicator

Show free/total disk space for the current drive in the status bar with a visual usage bar.

- **Why:** The data already exists in `state.drives` from `list_drives()`. This is purely a
  rendering task in `breadcrumb.js` / `updateStatusBar()`.
- **Blocked by:** R-01 (disk space on macOS/Linux must be fixed first).
- **Effort:** 1–2 days.

### 2.2 Quick Filter Bar (Type-to-Filter)

**Status:** Implemented.

A filter input that instantly narrows the current directory listing as the user types, without
triggering a recursive backend search.

- **Why:** The existing `Ctrl+F` search is recursive and replaces `state.entries`. There is no way
  to quickly filter the flat current listing. Essential for directories with 100+ files.
- **Keyboard shortcut:** `/` (Vim convention) toggles the filter bar; `Escape` clears and hides it.
- **Implementation:** Purely frontend — add `state.filterText`, modify `updateFilteredEntries()` in
  `file-list.js`, add a filter input element above the file list.
- **Effort:** 1–2 days.

### 2.3 Quick Access Sidebar Section

**Status:** Implemented.

A permanent sidebar section with platform-standard directory shortcuts: Home, Desktop, Documents,
Downloads, Pictures, Music, Videos.

- **Why:** Every major file manager has these. The sidebar pattern already exists in bookmarks.
- **Backend:** New `get_standard_directories()` Tauri command using the `dirs` crate.
- **Frontend:** New sidebar section above bookmarks, populated during `init()`.
- **Effort:** 2–3 days.

### 2.4 File Checksum Display in Properties Dialog

**Status:** Implemented.

Calculate and show MD5, SHA-1, and SHA-256 checksums for selected files in the properties dialog.
Checksums are calculated on-demand (button click) since large files are slow to hash.

- **Why:** The backend `checksum.rs` already exists. This just needs a UI surface.
- **Frontend:** Extend the properties dialog in `dialogs.js` with a "Checksums" accordion section.
- **Effort:** 1–2 days.

### 2.5 Clipboard History

**Status:** Implemented.

Track the last 10 copy/cut operations and allow pasting from any previous entry via a dropdown
(`Ctrl+Shift+V`).

- **Why:** Entirely frontend state management — no backend changes needed. Big usability win for
  multi-source assembly workflows.
- **Implementation:** New `state.clipboardHistory` array; modify `copy()` and `cut()` in `app.js`;
  add a popover UI triggered by `Ctrl+Shift+V`.
- **Effort:** 2–3 days.

---

## Phase 3 — Core Features (v0.5.0 – v0.7.0)

**Goal:** Features that define a great file manager.
**Target:** 3–4 months after Phase 2

### 3.1 Undo / Redo (v0.5.0)

**Status:** Basic reversible operation stack is implemented; deeper trash-restore and complex
batch-operation coverage still need hardening.

Track file operations (rename, move, copy, trash) and allow reversing them with `Ctrl+Z` /
`Ctrl+Shift+Z`.

- **State:** New `operationHistory` stack in `state.js`.
- **Frontend:** Each mutating action pushes an undo descriptor. `undo()` and `redo()` functions
  replay operations in reverse.
- **Backend:** No new commands needed — undo uses existing rename/move/restore commands.
- **Edge cases:** File modified between operation and undo; destination no longer exists; trash
  restoration (requires investigating `trash` crate's restore API).
- **Effort:** 1–2 weeks.

### 3.2 Batch Rename (v0.5.0)

**Status:** Implemented as Advanced Rename with recursive file targeting and live preview validation.

Rename multiple selected files at once, including files inside selected folders. Options include
templates, sequential numbering, literal or regex remove/replace, prefix/suffix/insertion,
case transforms, whitespace and separator cleanup, extension transforms, filters, and sanitization.
Includes live preview of resulting names before applying.

- **Backend:** New `batch_rename(entries: Vec<(String, String)>)` command; reuses `validate_name()`.
- **Frontend:** New dialog in `dialogs.js` with pattern input, live preview, confirm/cancel.
- **Keyboard:** `Ctrl+Shift+F2` (extends existing `F2` for single rename).
- **Effort:** 1 week.

### 3.3 Symlink Support (v0.5.0)

Display symlink targets in the file list and allow creating symlinks via the context menu.

- **Backend:** Add `is_symlink: bool` and `symlink_target: Option<String>` to `FileEntry`; use
  `fs::symlink_metadata()` to detect links; `fs::read_link()` for target; new `create_symlink()`
  command.
- **Frontend:** Link overlay icon in `file-list.js`; "Create Symlink…" context menu item.
- **Effort:** 3–4 days.

### 3.4 File Permissions Display & Editing (v0.6.0)

Show Unix permissions (rwxrwxrwx / octal) in the properties dialog with optional editing on
Linux/macOS.

- **Backend:** Add `permissions: Option<String>` to `FileEntry`; new `set_permissions(path, mode)`
  command using `std::fs::set_permissions()`.
- **Frontend:** Permissions section in properties dialog with owner/group/other checkboxes mapping
  to octal values.
- **Effort:** 4–5 days.

### 3.5 Path Bar Autocomplete (v0.6.0)

**Status:** Implemented.

Show directory completion suggestions when the user types in the path bar (`Ctrl+L`).

- **Backend:** New `autocomplete_path(partial)` command listing matching directories in the parent
  of the partial path.
- **Frontend:** Autocomplete dropdown below the path input in `breadcrumb.js`; Tab to accept, arrow
  keys to navigate, Escape to dismiss.
- **Effort:** 1 week.

### 3.6 Image EXIF Metadata (v0.6.0)

**Status:** Implemented.

Extract and display EXIF metadata (camera, date taken, dimensions, exposure) for image files in
the preview pane and properties dialog.

- **Backend:** New `get_image_metadata(path)` command using the `kamadak-exif` crate.
- **Frontend:** EXIF section in properties dialog and quick-look panel.
- **Effort:** 3–4 days.

### 3.7 Duplicate File Finder (v0.7.0)

**Status:** Partially implemented through Disk Cleanup duplicate SHA-256 grouping. A dedicated
review/delete duplicate finder remains future work.

Scan a directory recursively and group files with identical content (SHA-256 hash) for review and
optional deletion.

- **Backend:** New `find_duplicates(path, recursive)` command; groups by size first (cheap), then
  hashes only size-matching files; emits progress using the existing `ProgressUpdate` pattern.
- **Frontend:** Results dialog in `dialogs.js` showing duplicate groups with checkboxes for bulk
  delete.
- **Effort:** 1–2 weeks.

### 3.8 Configurable Columns (v0.7.0)

**Status:** Implemented for visible list columns.

Let users choose which columns appear in list view (Name, Size, Type, Date Modified, Date Created,
Permissions, Owner, Extension) and drag to reorder them.

- **Backend:** Extend `FileEntry` with `created`, `permissions`, `owner` optional fields.
- **State:** New `settings.visibleColumns` and `settings.columnOrder` arrays.
- **Frontend:** Dynamic column rendering in `file-list.js`; right-click column header to configure.
- **Effort:** 1 week.

### 3.9 File Tagging / Color Labels (v0.7.0)

**Status:** Implemented as persistent color labels.

Assign color labels or text tags to files and filter by tag from the sidebar.

- **Storage:** JSON file in the app data directory mapping paths to tag arrays. SQLite is a future
  upgrade path if performance demands it.
- **Backend:** New commands `set_tags`, `get_tags`, `get_all_tags`, `search_by_tag`.
- **Frontend:** Color dot badge in `file-list.js`; "Set Label…" context menu; Tags sidebar section.
- **Effort:** 1–2 weeks.

---

## Phase 4 — Advanced & Differentiating Features (v0.8.0 – v0.9.0)

**Goal:** Features that set SimpleFile apart from the competition.
**Target:** 2–3 months after Phase 3

### 4.1 Disk Usage Visualization (v0.8.0)

A treemap visualization showing relative sizes of files and folders in the current directory,
making it easy to identify what is consuming disk space.

- **Backend:** New `get_disk_usage_tree(path, depth)` returning a nested size tree.
- **Frontend:** New view mode or toolbar dialog; CSS-based treemap (no charting library needed for
  MVP). Click a block to navigate into that directory.
- **Effort:** 2–3 weeks.

### 4.2 Column View (Miller Columns) (v0.8.0)

**Status:** Removed from the active prototype plan. The sidebar tree and dual-pane workflows cover
the core navigation use case with less UI complexity.

A third view mode alongside list and grid, showing a hierarchy of columns where selecting a folder
opens its contents in the next column.

- **Backend:** No new commands — uses existing `list_directory()`.
- **Frontend:** New view mode in `content-area`; `state.columnViewPaths` array; column-specific
  click and keyboard handlers; horizontal scrolling.
- **Effort:** 2–3 weeks.

### 4.3 Open With (v0.8.0)

**Status:** MVP implemented. Remaining work is application discovery polish and cross-platform QA.

Right-click a file and choose which application to open it with, instead of always using the
system default.

- **Backend:** `open_file_with(path, application)` and `list_applications_for(path)` commands;
  platform-specific application discovery (`.desktop` files on Linux, `open -a` on macOS,
  shell execute on Windows).
- **Frontend:** "Open With…" context menu submenu; application chooser dialog.
- **Effort:** 2 weeks.

### 4.4 Split View File Comparison (v0.9.0)

Select two text files and compare them side-by-side with highlighted differences.

**Status:** MVP implemented in v1.0.2. Remaining work is larger-file UX, optional external diff
integration, binary metadata comparison, and cross-platform QA.

- **Backend:** `compare_files(path_a, path_b)` returns bounded line-level diff data for UTF-8 text
  files using an in-tree LCS diff.
- **Frontend:** Side-by-side modal with matched, added, removed, and changed lines.
- **Context menu/keyboard:** "Compare Files" when exactly two files are selected, plus Ctrl+=.
- **Effort:** MVP landed; further polish TBD.

### 4.5 External Drag-and-Drop (v0.9.0)

Drag files from SimpleFile to the desktop or other applications, and drop files from external
sources into SimpleFile.

- **Dependency:** Requires Tauri 2's native drag-and-drop support or `tauri-plugin-drag`.
- **Frontend:** Set `dataTransfer` types (`text/uri-list`, `Files`) with `file://` URIs on
  `dragstart`.
- **Effort:** 2–3 weeks (platform-specific; highest risk item on the roadmap).

---

## Phase 5 — Release Readiness (v1.0.0)

**Goal:** Production-quality release with full signing, packaging, and documentation.
**Target:** 1–2 months after Phase 4

### 5.1 Code Signing & Notarization

- **macOS:** Apple Developer certificate + notarization via Xcode/notarytool.
- **Windows:** Authenticode certificate (EV certificate recommended to avoid SmartScreen).
- **Linux:** GPG-signed `.deb`/`.rpm`/`.AppImage`.
- **Action:** Populate `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets
  before enabling updater artifact generation.

### 5.2 Auto-Updater

- Finalize Tauri updater endpoint and public-key configuration.
- Enable `bundle.createUpdaterArtifacts` after the signed update channel is configured.
- Host update manifests on GitHub Releases.
- Add "Check for updates" menu item and background update check on startup.

### 5.3 Internationalization (i18n)

- `i18n.js` is already scaffolded. Populate translation tables for at least:
  English (complete), Spanish, French, German, Japanese, Simplified Chinese.
- Add a language selector in Settings.

### 5.4 Accessibility

- Audit all interactive elements for correct ARIA roles and labels.
- Ensure keyboard navigation covers every action (no mouse-only paths).
- Test with screen readers: NVDA (Windows), VoiceOver (macOS), Orca (Linux).

### 5.5 Performance Baseline & Benchmarks

- Define acceptable performance targets:
  - Initial load of a directory with 10,000 files: < 500ms
  - Scroll through 10,000-item list: 60 fps
  - Copy 1 GB of files: progress events at least every 250ms
- Add benchmarks to CI to detect regressions.

### 5.6 Documentation

- Expand README with a feature walkthrough, GIF/screenshot gallery, and FAQ.
- Write `docs/ARCHITECTURE.md` explaining the Tauri command pattern, state management, and
  the CSS module system.
- Write `docs/EXTENDING.md` — a guide for contributors adding new Tauri commands or UI modules
  (the cloud plugin guide in `CONTRIBUTING.md` can serve as a template for this).

---

## Phase 6 — GitHub Page Professionalization

**Goal:** Make the GitHub repository look polished and trustworthy to visitors and contributors.

### 6.1 Repository Metadata

- [ ] Add a concise repository description and topic tags:
  `tauri`, `rust`, `file-manager`, `cross-platform`, `desktop-app`, `webview`
- [ ] Set the homepage URL to the project website or releases page
- [ ] Add a social preview image (1280×640 px) showing the app UI

### 6.2 README Overhaul

- [ ] Add a banner/logo image at the top
- [ ] Add a screenshot or animated GIF demonstrating the app in action
- [ ] Expand the badge row: CI status, latest release, platforms supported, license,
  code coverage, security audit status
- [ ] Add a "Getting Started in 60 seconds" quick-start section
- [ ] Add a "Why SimpleFile?" comparison table vs. alternatives
- [ ] Add a "Contributing" section linking to CONTRIBUTING.md
- [ ] Add a "Roadmap" section linking to ROADMAP.md
- [ ] Link to the Discussions tab for community support

### 6.3 Issue & PR Templates

- [ ] Bug report template (platform, version, steps to reproduce, expected vs. actual behavior)
- [ ] Feature request template (problem statement, proposed solution, alternatives considered)
- [ ] Pull request template (description, type of change, testing checklist, screenshots if UI)

### 6.4 CONTRIBUTING.md

- [ ] Development environment setup (Rust, Tauri CLI, system dependencies)
- [ ] How to run the app locally (`cargo tauri dev`)
- [ ] How to run tests (`cargo test`, Clippy, fmt check)
- [ ] Code style guide (Rust: follow Clippy; JS: no framework sprawl; CSS: follow existing module
  pattern)
- [ ] Commit message convention (type: description, e.g. `feat:`, `fix:`, `perf:`, `docs:`)
- [ ] Branch naming convention (`feat/`, `fix/`, `perf/`, `docs/`)
- [ ] How to open an issue before starting significant work
- [ ] How to submit a PR (small and focused; include tests; link the issue)

### 6.5 GitHub Community Files

- [ ] `CODE_OF_CONDUCT.md` (Contributor Covenant)
- [ ] `SECURITY.md` (how to report vulnerabilities privately; response SLA)
- [ ] `SUPPORT.md` (directing users to Discussions, not Issues, for questions)
- [x] Keep the root `LICENSE` file aligned with Apache-2.0 project licensing

### 6.6 Releases

- [ ] Create GitHub Releases for past versions with changelogs
- [ ] Follow [Keep a Changelog](https://keepachangelog.com) format in a `CHANGELOG.md`
- [ ] Tag every release: `v0.2.0`, `v0.3.0`, etc.
- [ ] Attach pre-built binaries: `.AppImage` (Linux), `.exe` installer (Windows), `.dmg` (macOS)

### 6.7 GitHub Actions Enhancements

- [ ] Add code coverage reporting (e.g., `cargo-tarpaulin` → Codecov badge)
- [ ] Add a `labeler.yml` workflow that auto-labels PRs by changed files
- [ ] Add a `stale.yml` workflow to auto-close inactive issues after 90 days
- [x] Make `cargo audit` a hard build failure with explicit accepted advisory IDs
- [x] Add `dependabot.yml` for automated dependency updates

---

## Version Summary

| Version | Theme | Key Deliverables |
|---------|-------|-----------------|
| **v0.3.0** | Stability | All 8 remaining bugs fixed, test coverage, error handling audit |
| **v0.4.0** | Quick Wins | Disk space indicator, quick filter, quick access sidebar, checksums, clipboard history |
| **v0.5.0** | Power User I | Undo/redo, batch rename, symlink support |
| **v0.6.0** | Power User II | File permissions, path autocomplete, EXIF metadata |
| **v0.7.0** | Power User III | Duplicate finder, configurable columns, file tagging |
| **v0.8.0** | Differentiators | Disk usage visualization, column view, open-with |
| **v0.9.0** | Polish | File comparison MVP landed in v1.0.2; external drag-and-drop polish remains |
| **v1.0.0** | Release baseline | Cross-platform CI/CD, release builds, cloud mount hardening, About dialog, and full docs |
| **v1.1+** | Distribution hardening | Code signing, production updater channel, accessibility benchmarks, performance benchmarks |

---

## Contributing to the Roadmap

This roadmap is a living document. To propose changes:

1. Open an issue with the label `roadmap` describing the addition or change.
2. For new feature proposals, follow the format in `FEATURE_OPPORTUNITIES.md`.
3. For reprioritization requests, explain the use case and impact.

Large features should be discussed in an issue before any code is written.

---

## Out of Scope for v1.0

The following were considered and deliberately excluded from the v1.0 scope:

- **Built-in text editor** — Opens scope too far; use "Open With" instead.
- **Cloud sync client** — Google Drive, pCloud, and OneDrive mounting is supported; two-way sync is out of scope.
- **Mobile support** — Tauri 2 supports mobile; this is a post-v1.0 investigation.
