# UI and Backend Review - v1.0.0

This review documents the usability, wiring, reliability, and CI/CD findings for the v1.0.0 baseline.

## 2026-05-22 maintenance update

- `src-tauri/Cargo.lock` is now committed and CI/release jobs use `--locked`.
- Rust formatting, compile, Clippy with `-D warnings`, and tests pass locally.
- Frontend JavaScript syntax checks now run through `frontend/scripts/check-js-syntax.mjs`.
- `cargo audit --deny warnings` remains a hard CI gate with explicit accepted advisories for current Tauri/Linux GTK and `urlpattern` transitive warnings.
- Release packaging now uses `tauri-apps/tauri-action@action-v0.6.2`.
- The updater plugin now has an explicit placeholder config so it cannot abort startup; updater artifacts remain disabled until signing and endpoint configuration are complete.
- Windows startup panics are written to `%LOCALAPPDATA%\SimpleFile\startup.log`.

## 2026-05-24 maintenance update

- `tauri-plugin-shell` has been removed; terminal launch and Open With behavior use scoped backend
  process-launch commands with argument separation, trusted application roots, and a shell/runtime
  denylist.
- Disk cleanup has a dedicated frontend workflow, progress reporting, cancellation, and result
  presentation.
- The More Actions menu now includes a complete About SimpleFile dialog with live metadata.
- `npm run check:invokes` verifies frontend IPC wrapper names against the Rust command registry.

## Scope

Reviewed areas:

- `frontend/index.html`
- `frontend/css/styles.css` and modular CSS usage by inspection of UI structure
- `frontend/js/app.js`
- `frontend/js/api.js`
- `frontend/js/events.js`
- `frontend/js/ui/*`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/lib.rs`
- backend modules registered through the Tauri invoke handler
- existing GitHub Actions workflows

## 1. GUI and UI usability analysis

### Findings already in good shape

- The main shell uses semantic landmarks: `role="application"`, navigation regions, toolbar, path navigation, file-list region, status bar, and modal overlays.
- Primary file list selection exposes `role="listbox"`, `role="option"`, `aria-selected`, and roving `tabindex` semantics.
- Common navigation/actions have clear button labels and titles.
- Keyboard shortcuts cover core file-manager behavior: navigation, selection, search, tabs, rename, delete, copy/cut/paste, and tree traversal.
- Theme selection is applied before first paint, which avoids a visible dark/light flash on startup.
- File rendering is virtualized for large directories and thumbnail loading is batched to reduce UI jank.
- Folder-size calculation is lazy and cancellable, preventing large directories from blocking normal navigation.
- DOM references are resolved lazily through `frontend/js/ui/elements.js`, which prevents stale/null element references if modules load before the document is fully parsed.

### Usability risks to keep tracking

- The secondary/dual-pane file list has less complete ARIA semantics than the primary pane. It should mirror the primary pane with `role="region"`, `role="listbox"`, `aria-multiselectable`, columnheader roles, and roving `tabindex` behavior.
- Several modal close buttons use only `×` as visual content. They should consistently include `aria-label="Close"` so screen-reader output is clear.
- Some icon-only toolbar/menu items depend heavily on emoji or symbolic glyphs. Keep labels/titles in sync with actions and avoid relying on icon meaning alone.
- The context menu is action rich and may become long on smaller screens. Consider grouping destructive actions visually and ensuring keyboard roving focus inside the menu.
- Toasts currently debounce duplicate errors, but different rapid errors can still stack. A capped toast container would prevent status messages from obscuring the file list.
- Archive UI should keep the frontend-supported list aligned with the backend-supported list: ZIP, TAR, TAR.GZ/TGZ, and RAR.

### Recommended next UI improvements

1. Mirror primary file-list accessibility attributes in the secondary pane.
2. Add explicit `aria-label="Close"` to every icon-only close button.
3. Add an accessibility smoke test that checks unique IDs, labeled icon buttons, and expected roles.
4. Add a toast container with a maximum visible count.
5. Document all keyboard shortcuts directly in Settings or Help, not only in README.

## 2. Backend Rust analysis

### Wiring findings

- `src-tauri/src/lib.rs` registers the app state, opener/updater plugins, and all backend commands through `tauri::generate_handler!`.
- `frontend/js/api.js` wraps the Tauri IPC commands used by the UI, including filesystem, progress, watcher, preview, search, git, archive, terminal, checksum, installer, app-version, and updater calls.
- Version wiring is now aligned across `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`,
  and `src-tauri/tauri.conf.json` at `1.0.0`.

### Backend reliability/performance findings already in good shape

- Core file operations validate names and paths before acting on them.
- Symlink-sensitive operations use lstat/no-follow validation when needed, reducing accidental target deletion or rename behavior.
- `create_file` uses atomic `create_new(true)` semantics to avoid TOCTOU overwrites.
- Copy/move helpers avoid silently overwriting conflicts and guard against copying a directory into itself.
- Cross-device/network moves fall back to copy/delete behavior.
- Directory traversal for count/size operations is iterative and cancellable instead of recursive-only.
- Archive extraction includes path traversal defenses for ZIP, TAR, TAR.GZ/TGZ, and RAR.
- ZIP archive creation streams file data instead of buffering whole files into memory.
- RAR creation uses argument separation and path safeguards to reduce command/argument injection risk.
- Thumbnail generation and preview functionality are separated from core file operations, making performance behavior easier to reason about.

### Backend risks to keep tracking

- Search cancellation exists, but very large tree behavior should keep receiving regression tests.
- Shell/process launch behavior should remain tightly scoped and reviewed whenever terminal,
  installer, or Open With behavior changes.
- Tar archive creation with `append_dir_all` should be re-reviewed for symlink behavior if symlink preservation becomes a feature.
- Release signing/updater configuration should be finalized before relying on automatic updates in production.

### Recommended next backend improvements

1. Keep the committed `src-tauri/Cargo.lock` in sync with dependency changes.
2. Add broader tests for search cancellation and large-directory behavior.
3. Add tests for symlink delete/rename/copy behavior on supported platforms.
4. Add archive format tests for unsupported `.gz` and `.7z` paths to keep UI/backend behavior aligned.
5. Keep `frontend/scripts/check-tauri-invokes.mjs` in CI and extend it if command registration
   moves out of the current `tauri::generate_handler!` pattern.

## 3. CI/CD work completed

### CI workflow

`.github/workflows/ci.yml` now:

- Runs on pushes and pull requests targeting `main`.
- Supports manual `workflow_dispatch` runs.
- Cancels superseded runs on the same branch/ref.
- Runs Rust formatting, Clippy, and tests.
- Runs frontend JavaScript module syntax checks and frontend/backend invoke checks with Node.
- Runs Rust dependency audit.
- Uses a committed lockfile instead of generating dependency resolution inside each job.
- Runs dependency review on pull requests.
- Builds Linux x64, Windows x64, macOS x64, and macOS ARM64 targets after
  quality/security checks pass.

### Release workflow

`.github/workflows/release.yml` now:

- Runs on `v*` tags and manual dispatch.
- Validates that the release tag/manual version matches both `Cargo.toml` and `tauri.conf.json`.
- Runs release quality gates before packaging installers.
- Builds Windows x64, macOS x64, macOS ARM64, and Linux x64 release artifacts.
- Uses Tauri Action to upload release artifacts.
- Supports draft releases by default and publishing through the manual `draft=false` input.

## 4. Version bump

Version bumped to `1.0.0` in:

- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `README.md` version badge
- `CHANGELOG.md`

## 5. Summary

The project is generally well-structured for a Tauri file manager: frontend IPC wrappers are centralized and Rust backend modules are separated by capability. The most important delivery issue was not application logic but release hygiene: CI/CD now validates release-version consistency, runs release quality gates, and builds cross-platform installer artifacts for the v1.0.0 baseline while documenting remaining usability/backend follow-up work.
