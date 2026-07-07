# SimpleFile

<div align="center">

**A modern, cross-platform file manager with a fast Rust/Tauri backend and a lightweight Svelte frontend.**

[![CI](https://github.com/conniecombs/SimpleFile-Linux/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/conniecombs/SimpleFile-Linux/actions/workflows/ci.yml)
[![Release](https://github.com/conniecombs/SimpleFile-Linux/actions/workflows/release.yml/badge.svg)](https://github.com/conniecombs/SimpleFile-Linux/actions/workflows/release.yml)
[![Version](https://img.shields.io/badge/version-1.1.0-blue)](https://github.com/conniecombs/SimpleFile-Linux/releases)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-purple)](https://tauri.app)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)](#build)
[![Security Policy](https://img.shields.io/badge/security-policy-informational)](docs/SECURITY.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](docs/CONTRIBUTING.md)

</div>

---

## Overview

SimpleFile is a feature-rich desktop file manager built with Rust, Tauri 2, and a Svelte/Vite frontend. It aims to provide the speed and safety of native file operations while keeping the UI small, customizable, and easy to extend.

The current 1.1.0 release branch includes dual-pane and tabbed browsing, advanced rename, quick filtering, configurable and resizable list columns, folder size and item-count visibility, advanced recursive search, conflict-aware transfers, undo/redo, archive tools, file labels, clipboard history, side-by-side text comparison, checksums, EXIF metadata, symlink and permission display, Git status, cancellable disk cleanup, FTP/WebDAV browsing, rclone-backed cloud browsing, cloud-to-cloud transfers, Windows drive-letter mounts through WinFsp, responsive mounted-drive transfer progress, a transfer manager, and a signed GitHub-hosted updater channel.

---



## Why SimpleFile?

SimpleFile is designed for users who want a practical file manager that can handle everyday browsing and power-user workflows without pulling in a large UI framework.

- **Native operations with guardrails:** Rust commands handle file operations, path validation, conflict handling, symlink-aware copy/delete behavior, and scoped process launching.
- **Cloud drives are first-class workflows:** rclone-backed providers can browse, transfer, rename, delete, create folders, copy cloud-to-cloud, and mount as local drives. Windows mounts use high drive letters and WinFsp-specific freeze safeguards.
- **Power metadata without leaving the file manager:** checksums, EXIF, image dimensions, permissions, symlink targets, Git state, duplicate groups, large-file scans, and text file comparisons are built in.
- **Modern Typescript Architecture:** The frontend is entirely powered by native Svelte 5 state runes and strict TypeScript modules, leaving behind older vanilla JS implementations.
- **Extremely Fast Rendering:** A custom math-based UI virtualization engine ensures instant rendering and smooth 60fps scrolling even with 10,000+ files in a single directory.
- **Native Wayland Compatibility:** Tauri and WebKitGTK are fully configured for Wayland with NVIDIA WebKit rendering fixes and native GTK backend (`GDK_BACKEND=wayland,x11`) injections.
- **Fast local UI:** The app ships from a compiled Svelte entry while retaining focused JavaScript workflow modules for mature file-manager behavior.
- **Practical safety features:** undo/redo, undoable toasts, delete-to-trash fallback handling, cancellable long-running jobs, transfer progress, and mount-specific background-scan suppression.
- **Documented release and updater path:** signed updater artifacts, GitHub-hosted `latest.json`, release validation, and rclone/WinFsp behavior are documented in this repository.

---

## Feature Highlights

### Core File Manager

- **File browsing** with list and grid modes.
- **Configurable, resizable columns** in list view for Size, folder item count, Modified, and Type.
- **Sortable columns** for common file metadata.
- **Multiple tabs** for working in several folders at once.
- **Dual-pane mode** for side-by-side copy and move workflows.
- **Folder tree sidebar** with expandable directory navigation.
- **Breadcrumb navigation** with editable path input and autocomplete.
- **Quick access sidebar** for Home, Desktop, Documents, Downloads, Pictures, Music, Videos, Trash, and cleanup tools.
- **Recent locations** and bookmarks.
- **Disk-space status** for the current drive in the status bar.
- **On-demand folder sizes** for selected directories without eagerly scanning every folder.
- **Keyboard-first navigation** for common actions.

### File Operations

- **Create folders and files.**
- **Rename selected items** or use **Advanced Rename** for recursive batch rename workflows with a live preview.
- **Advanced Rename options** include recursive files in selected folders, name/extension filters, literal or regex remove/replace, templates with tokens such as `{base}`, `{parent}`, and `{n}`, trim/collapse whitespace, insertion, capitalization, separator cleanup, sequential numbering, extension transforms, invalid-character sanitization, and duplicate/invalid target warnings before apply.
- **Copy, cut, paste, and move files/folders.**
- **Delete to trash** with permanent-delete fallback when trash is unavailable.
- **Pack selected items** into a new folder.
- **Unpack folder contents** back into the current directory.
- **Compare two text files** side by side from the context menu or `Ctrl+=`.
- **Open with default app** through Tauri's opener plugin.
- **Open With...** dialog for choosing a specific executable or app.
- **Terminal integration** for opening a terminal in the current directory.
- **PowerShell admin integration** on Windows.

### Conflict-Aware Transfers

Copy and move workflows can detect destination conflicts and ask how to proceed.

Supported conflict responses:

- **Keep both** by auto-renaming the destination copy.
- **Replace existing** destination items.
- **Skip** the conflicting item.
- **Cancel** the current transfer.
- **Apply to remaining conflicts** for batch operations.

Conflict handling is wired into paste, copy-to, move-to, and dual-pane copy/move flows.

### Undo and Redo

SimpleFile includes a command-pattern undo/redo stack for reversible operations.

Current undo support includes:

- Rename operations.
- Advanced rename batches.
- File and folder creation.
- Copy batches where destinations can be moved to trash.
- Move batches where files can be moved back when source/destination information is available.
- Inline **Undo** buttons in success toasts for recent operations.

### Clipboard History

SimpleFile keeps a short history of recent copy and cut operations so repeated multi-source work does not have to be rebuilt from scratch.

- Access from More Actions or `Ctrl+Shift+V`.
- Restores previous copy/cut selections into the active clipboard.
- Deduplicates consecutive identical clipboard actions.

### Search and Filtering

SimpleFile includes both quick filtering and a richer recursive search workflow.

- **Quick filter** narrows the current directory without a backend search.
- **Advanced recursive search** supports:
  - filename search
  - optional content search for text files
  - case-sensitive matching
  - hidden-file inclusion
  - file extension filters
  - minimum and maximum file size filters
  - modified-after and modified-before date filters
  - configurable search depth
  - configurable maximum results
- **Cancellable search** using backend search IDs.
- **Streamed search results** from backend to frontend.
- **Recent search suggestions** for repeated queries.

### Preview and Metadata

- **Quick Look previews** for supported files.
- **Text preview** with truncation for large files.
- **Image preview** with thumbnails.
- **PDF preview** for reasonably sized PDF files.
- **Cloud mount safeguards:** known rclone/WinFsp cloud mounts skip automatic previews,
  thumbnails, watchers, folder-size scans, and recursive properties to keep mounted drives
  responsive.
- **Properties dialog** with path, size, modified date, type, permissions, symlink target, and hashes.
- **Image dimensions** for supported images.
- **EXIF metadata** extraction for images with EXIF tags.
- **Checksums** for files:
  - MD5
  - SHA-1
  - SHA-256

### File Comparison

SimpleFile can compare two selected UTF-8 text files without launching an external diff tool.

- Select exactly two files and choose **Compare Files**.
- Side-by-side rows show matching, changed, added, and removed lines.
- File size and line-count guards prevent accidental expensive comparisons.
- Binary files and folders are rejected with a clear message.

### File Labels

SimpleFile supports persistent color labels stored in local frontend state.

Supported labels:

- red
- orange
- yellow
- green
- blue
- purple
- gray
- clear/no label

Labels appear as badges in list and grid views and can be managed from the context menu.

### Disk Cleanup

The cleanup workspace helps identify files that may be taking up space.

Current cleanup support includes:

- Large-file scanning with a default 100 MiB threshold.
- Duplicate grouping by file size and SHA-256 hash.
- Progress reporting through the shared progress dialog.
- Cancellation from the progress dialog.
- A results modal showing the largest files and duplicate groups found.
- Quick Access sidebar entry for running cleanup on the current directory.

### Archive Support

SimpleFile can inspect and work with common archive formats.

- List archive contents.
- Extract supported archives.
- Create archives from selected files/folders.
- Supported formats include ZIP, TAR, TAR.GZ/TGZ, and RAR where tooling is available.
- Path traversal safeguards are used for extraction.

### Git Integration

SimpleFile can show Git repository status for the current folder.

- Detects repository state.
- Shows branch information when available.
- Shows branch and clean/dirty state in the main status bar.
- Shows detailed staged, modified, untracked, ahead, and behind counts in Settings when the current folder is inside a Git repository.
- Tracks modified, staged, untracked, ahead, and behind counts.

### Drag and Drop

SimpleFile supports richer two-way drag-and-drop workflows.

- **App to app / desktop drag-out** uses transferable URI/text payloads.
- **Global Drag-and-Drop** support enables natively dragging items seamlessly from both the folder tree sidebar and the main window list/grid.
- **OS to app drops** can copy files into the current directory.
- **Folder-targeted drops** can resolve a destination from hovered folder items when available.
- **Internal drag-and-drop** works across the file list and dual panes.
- External drops route through conflict-aware transfer handling when possible.

### Cloud and Network Features

SimpleFile includes a plugin-based cloud architecture and a generic cloud browser.

Supported or registered providers:

| Provider | Status |
|---|---|
| Google Drive | rclone-backed browser sign-in, browsing, upload/download, create folder, rename, delete, mount support |
| pCloud | rclone-backed browser sign-in, US/EU region support, browsing, upload/download, create folder, rename, delete, mount support |
| OneDrive | rclone-backed browser sign-in, browsing, upload/download, create folder, rename, delete, mount support |
| Dropbox | rclone-backed browser sign-in, browsing, upload/download, create folder, rename, delete, mount support |
| S3-compatible | rclone-backed credentials, browsing, upload/download, create folder, rename, delete, mount support |
| FTP | Direct browsing, segmented downloads, and optional mount support where platform tooling is available |
| WebDAV | Direct browsing, downloads, and optional mount support where platform tooling is available |

### Transfer Manager

Cloud and network operations can be queued and tracked through a transfer manager.

- Queued, running, paused, completed, failed, and cancelled states.
- Parallel transfer cap for active jobs.
- Retry, pause/resume for queued jobs, cancel, and clear-completed actions.
- Integrated with cloud download/upload flows.
- Cloud-to-cloud copy and move jobs between configured rclone remotes.
- Handles progress events emitted by backend operations where available.

### Cloud-to-Cloud Transfers

Rclone-backed providers can copy or move files and folders directly from one
configured cloud remote to another. In Remote Drives, select an item in Google
Drive, OneDrive, pCloud, Dropbox, or S3-compatible storage and use **Copy To...**
or **Move To...**. SimpleFile asks for the destination cloud remote, optional
destination folder path, and destination name, then queues the job in Transfer
Manager.

When both providers support server-side operations, rclone uses them. Otherwise
the transfer streams through the machine running SimpleFile without first
creating a full temporary local copy.

Mounted rclone drives also appear in the Network Drives sidebar. On Windows,
SimpleFile mounts rclone cloud drives to available high drive letters rather
than app-data folders. It preserves the configured mount point, lists known
cloud mount folders through `rclone lsjson`, and avoids background filesystem
probes that can block inside WinFsp.

See [`CLOUD_DRIVES.md`](docs/CLOUD_DRIVES.md) for rclone and WinFsp installation,
drive-letter behavior, troubleshooting, security notes, and credits.

### Settings and UI

- Dark and light themes.
- Persisted preferences via `localStorage`.
- Configurable list columns.
- Default view and icon size settings.
- Hidden-file toggle.
- Delete confirmation setting.
- Recent-location visibility setting.
- Keyboard shortcut help screen.
- About SimpleFile dialog with live app metadata, feature summary, project link,
  and rclone/WinFsp credits.
- App update controls backed by the signed GitHub updater channel.
- i18n-ready string infrastructure.

---

## Getting Started

### Prerequisites

#### Linux (Flatpak - Universal)
Flatpak is the modern standard for distributing desktop applications across all Linux distributions (Fedora, Arch, openSUSE, etc.). It forces the app to properly declare its sandbox permissions, making it more secure.
A Flatpak manifest (`com.simplefile.SimpleFile.yml`) and GitHub Actions CI workflow are included for automated builds.

```bash
# Install flatpak and flatpak-builder
sudo apt install flatpak flatpak-builder
```

#### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev \
  patchelf
```

#### macOS

```bash
xcode-select --install
```

#### Windows

Install:

- Visual Studio C++ Build Tools
- WebView2 Runtime if it is not already installed
- Optional for mounted cloud drives: WinFsp. SimpleFile can install this from
  **Settings -> Cloud Tools -> Install WinFsp Driver** when a Windows rclone
  mount needs it.

Windows 11 usually includes WebView2 by default.

### Install Rust and Tauri CLI

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install the Tauri CLI
cargo install tauri-cli --version "^2.0.0" --locked
```

### Run in Development Mode

```bash
git clone https://github.com/conniecombs/SimpleFile-Linux.git
cd SimpleFile
cargo tauri dev
```

Tauri builds the Svelte frontend before launch. Rerun the command after
frontend bundle changes; backend changes trigger a Rust rebuild.

---

## Local Quality Checks

Run the frontend/app-shell checks during normal development:

```bash
npm run check
```

Run the full local release gate before opening a release or large migration PR:

```bash
npm run check:release
```

`src-tauri/Cargo.lock` is committed for reproducible desktop builds. The CI
security job also runs `cargo audit --deny warnings` with documented accepted
advisories for current Tauri/Linux GTK transitive dependencies.

`npm run check` runs the Svelte build/type checks, Svelte-to-legacy bridge
builds, legacy JavaScript checks, frontend/backend invoke checks, and updater
configuration checks. `npm run check:release` adds Rust formatting, tests, and
Clippy.

`npm run check:frontend` verifies that legacy frontend `invoke()` calls remain
aligned with the Rust command registry in `src-tauri/src/lib.rs`.

The updater check inside `npm run check:frontend` verifies that the
GitHub-backed updater endpoint, public key, updater artifacts, and release
workflow signing settings remain enabled.

---

## Build

Produce a release bundle for the current platform:

```bash
cargo tauri build --ci
```

The Tauri build hooks generate `frontend/dist` before packaging.

Updater-enabled release bundles must be signed. For local builds, load the
ignored local private key into Tauri's signing environment first:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content .\.secrets\simplefile-updater.key -Raw
cargo tauri build --ci
```

Installers and bundles are written to:

```text
src-tauri/target/release/bundle/
```

See [`.github/RELEASE.md`](.github/RELEASE.md) for the full release process.
See [`UPDATER_RELEASE.md`](docs/UPDATER_RELEASE.md) for updater signing and GitHub
release setup.

---

## Cloud Provider Setup

### pCloud

Use the pCloud panel to start rclone-backed **Sign in with pCloud**.
Choose the United States or Europe region before sign-in so rclone requests the
token from the correct pCloud host. pCloud handles username, password, and
two-factor prompts in the browser; SimpleFile never asks for or stores a pCloud
password.

rclone is required for browsing, transfer, and mounting. SimpleFile can install
it from Settings -> Cloud Tools. Windows drive mounting also requires WinFsp;
SimpleFile exposes a separate **Install WinFsp Driver** button and uses
drive-letter mounts instead of app-data folders.

### Google Drive

Use the Google Drive panel to start rclone-backed **Sign in with Google**.
rclone opens Google's authorization page in the system browser, so Google
handles username, password, and 2-step verification prompts. SimpleFile never
asks for or stores a Google password.

rclone is required for browsing, transfer, and mounting. SimpleFile can install
it from Settings -> Cloud Tools. Windows mounts additionally require WinFsp.

### OneDrive

Use the OneDrive panel to sign in through rclone. Microsoft handles username,
password, and MFA in the browser.

rclone is required for browsing, transfer, and mounting.
rclone mount on Windows additionally requires WinFsp.

### Dropbox

Use the Dropbox provider panel to sign in through rclone. No manually generated
Dropbox access token is required for normal use.

### S3-Compatible Storage

Enter S3-compatible credentials for AWS S3, MinIO, Wasabi, or another compatible
endpoint. SimpleFile stores the remote in its local rclone config and uses
rclone for browsing, transfers, and mounting.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `F2` | Rename selected item |
| `F5` | Refresh current directory |
| `Delete` | Move selected item(s) to trash |
| `Backspace` | Navigate up one directory |
| `Ctrl+C` | Copy selected item(s) |
| `Ctrl+X` | Cut selected item(s) |
| `Ctrl+V` | Paste |
| `Ctrl+A` | Select all visible items |
| `Ctrl+F` | Search files |
| `/` | Quick filter current directory |
| `Ctrl+Shift+F` | Quick filter current directory |
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close current tab |
| `Enter` | Open selected item |
| `Space` | Quick Look selected item |
| `Ctrl+=` | Compare two selected text files |
| `F6` | Toggle dual-pane mode |
| `Ctrl+Z` | Undo last reversible action |
| `Ctrl+Y` | Redo last undone action |
| `Ctrl+Shift+V` | Clipboard history |
| `Ctrl+H` | Toggle hidden files |
| `Ctrl+L` | Edit path |
| `Ctrl+N` | Create folder |
| `Ctrl+Shift+N` | Create file |
| `F1` | Keyboard shortcut help |

---

## Project Structure

```text
SimpleFile/
+-- frontend/
|   +-- index.html                  # Vite entry
|   +-- package.json                # Frontend scripts and dependencies
|   +-- src/
|   |   +-- main.ts                 # Shipping Tauri web entry
|   |   +-- App.svelte              # Svelte app root
|   |   +-- css/                    # Shared app styles
|   |   +-- lib/                    # Typed API, workflows, Svelte components
|   |   +-- vanilla-js/             # Plain JavaScript runtime and audit artifacts
|   |   |   +-- runtime/            # Live plain JavaScript imported by Svelte
|   |   |   +-- generated-svelte/   # Generated audit bundles
|   |   |   +-- README.md
|   |   +-- vite-env.d.ts
|   +-- scripts/                    # Frontend migration and bridge checks
|   +-- dist/                       # Generated build output
|
+-- src-tauri/
|   +-- Cargo.lock
|   +-- Cargo.toml
|   +-- tauri.conf.json
|   +-- src/                        # Rust/Tauri commands and app setup
|
+-- scripts/                        # Repository quality and smoke checks
+-- docs/                           # Project documentation
+-- .github/                        # CI/CD workflows and templates
+-- LICENSE
+-- README.md
```

---

## Development Notes

### Frontend

The desktop app ships from `frontend/src/main.ts`. That Svelte/Vite entry
mounts `App.svelte`, loads shared CSS, and renders the Svelte-owned shell.

Core patterns:

- `frontend/src/lib/` owns typed Tauri API wrappers, workflow modules, and Svelte component mounts.
- `frontend/src/vanilla-js/runtime/` contains plain JavaScript runtime helpers used by Svelte.
- `frontend/src/vanilla-js/generated-svelte/` contains generated JavaScript/CSS artifacts kept for migration audits.
- `frontend/src/lib/cloud-providers/` and `frontend/src/lib/legacy-cloud-plugins/` register provider-specific frontend behavior.

### Backend

The backend is organized by capability.

Most new features follow this pattern:

1. Add serializable request/response models in `models.rs` when needed.
2. Implement a `#[tauri::command]` function in the relevant module.
3. Register the command in `lib.rs` with `tauri::generate_handler!`.
4. Add a wrapper function and command contract in `frontend/src/lib/api.ts` and `frontend/src/lib/types.ts`.
5. Wire the UI action into a Svelte workflow module, component, or provider plugin.

### Persistence

Frontend settings, bookmarks, recent locations, file labels, recent searches, and recent Open With entries are stored in `localStorage`.

Mount configuration for network/cloud drives is handled by backend mount infrastructure where applicable.
Windows rclone cloud mounts store their chosen drive letter in the mount configuration and avoid
app-data mount folders. See [`CLOUD_DRIVES.md`](docs/CLOUD_DRIVES.md).

### Startup diagnostics

Windows release builds run without a console, so startup panics are also appended to `%LOCALAPPDATA%\SimpleFile\startup.log`. On Linux/macOS the same log is written under the closest app-data or home-directory fallback.

---

## CI/CD

The repository includes GitHub Actions workflows for quality checks, security checks, platform backend builds, and release packaging.

### CI workflow

`ci.yml` handles formatting, linting, tests, dependency checks, Svelte and JavaScript checks, frontend/backend invoke checks, updater config checks, workflow wiring checks, and platform backend builds. Rust checks use the committed lockfile with `--locked`, and frontend checks run through the root `npm run check` gate.

### Release workflow

`release.yml` handles version validation, release quality gates, cross-platform Tauri builds, signed updater artifact generation, `latest.json` upload through `tauri-apps/tauri-action@action-v1.0.0`, installer artifact upload, and optional publishing. GitHub Releases serve as the updater endpoint.

### Release version rules

Release tags must use the format:

```text
vMAJOR.MINOR.PATCH
```

Manual release versions are optional. If left blank, the workflow uses the
checked-in manifest version. Explicit manual versions may use either
`MAJOR.MINOR.PATCH` or `vMAJOR.MINOR.PATCH`; the workflow normalizes them to the
release tag format.

The version must match both:

- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

### Secrets for signed updater releases

| Secret | Purpose |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Signs updater artifacts |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Optional passphrase for the signing key |

The updater plugin is configured in `src-tauri/tauri.conf.json` with a GitHub
`latest.json` endpoint. Release builds fail early when
`TAURI_SIGNING_PRIVATE_KEY` is missing so a published release cannot silently
omit updater signatures.

---

## Current Status

SimpleFile is at the v1.1.0 release branch. The codebase now ships from the Svelte/Tauri entry and includes a broad set of file-manager features plus signed updater release metadata, while ongoing hardening work remains for platform code signing, notarization, accessibility benchmarks, and performance validation on very large directories.

Recent 1.1.0 and 1.0.x work includes:

- Advanced search UI and cancellable backend search.
- Advanced Rename with recursive file targeting, filters, templates, regex operations, cleanup transforms, and live preview validation.
- Open With UI and backend command.
- Side-by-side UTF-8 text file comparison.
- Copy/move conflict resolution.
- File labels and label badges.
- Clipboard history for recent copy/cut actions.
- Configurable list columns.
- Disk cleanup entry and backend cleanup scan.
- Full properties metadata with hashes, permissions, symlink targets, dimensions, and EXIF.
- Undoable success toasts.
- Two-way drag-and-drop improvements.
- Transfer manager for cloud/network jobs.
- Dropbox provider implementation.
- S3-compatible provider metadata scaffold.
- rclone and WinFsp installer/status UI.
- Windows rclone drive-letter mounts with cloud-specific freeze safeguards.
- About SimpleFile dialog with live metadata and third-party credits.

---

## Roadmap

See [`ROADMAP.md`](docs/ROADMAP.md) for the broader plan.

Current high-priority areas:

- Full cross-platform QA for copy/move conflict resolution.
- Windows cloud mount QA for rclone drive letters, WinFsp install detection, and unhealthy mount
  recovery.
- Stronger undo support for trash restore and complex batch operations.
- More complete S3-compatible provider implementation.
- Richer disk cleanup UI with safe bulk actions.
- Accessibility audit for new dialogs and transfer-manager controls.
- Performance benchmarks for 10,000+ item directories.
- Code signing, notarization, and updater smoke testing across installed releases.
- Expanded localization tables and language selector.

---

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](docs/CONTRIBUTING.md) before opening a pull request.

Useful contribution areas:

- Provider plugins.
- Accessibility improvements.
- Platform-specific bug fixes.
- Test coverage.
- Documentation.
- UI polish.
- Performance benchmarks.

For significant changes, open an issue first so the approach can be discussed.

---

## Security

Please do not open public issues for security vulnerabilities. See [`SECURITY.md`](docs/SECURITY.md) for private reporting instructions.

Security-sensitive areas include:

- archive extraction
- shell/terminal launching
- path validation
- cloud credentials
- OAuth tokens
- mount restoration
- file deletion and trash handling

---

## Support

Questions and usage help should go through the support channels described in [`SUPPORT.md`](docs/SUPPORT.md).

Bug reports should include:

- operating system
- SimpleFile version or branch
- steps to reproduce
- expected behavior
- actual behavior
- screenshots or logs when useful

---

## Credits

SimpleFile's cloud features use rclone for provider configuration, cloud browsing,
transfers, cloud-to-cloud operations, and mount processes. rclone was created by
Nick Craig-Wood and is maintained by the rclone contributors.

On Windows, mounted cloud drives use WinFsp through rclone. WinFsp was created by
Bill Zissimopoulos and is maintained by the WinFsp contributors.

See [`CLOUD_DRIVES.md`](docs/CLOUD_DRIVES.md) for more detail.

---

## License

SimpleFile is proprietary software. All rights are reserved by conniecombs.
Use, copying, modification, redistribution, sublicensing, resale, hosting, or
derivative works are not permitted without prior written permission. See
[`LICENSE`](LICENSE).
