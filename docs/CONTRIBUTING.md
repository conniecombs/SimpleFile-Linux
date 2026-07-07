# Contributing to SimpleFile

Thank you for your interest in contributing! SimpleFile is a cross-platform file manager built with
Rust/Tauri and Svelte. Contributions of all kinds are welcome — bug fixes, features,
tests, documentation, and design feedback.

---

## Table of Contents

1. [Before You Start](#before-you-start)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Running the App](#running-the-app)
5. [Running Tests](#running-tests)
6. [Code Style](#code-style)
7. [Commit Messages](#commit-messages)
8. [Branch Naming](#branch-naming)
9. [Opening Issues](#opening-issues)
10. [Submitting a Pull Request](#submitting-a-pull-request)
11. [Reporting Security Vulnerabilities](#reporting-security-vulnerabilities)

---

## Before You Start

- **Check existing issues** before opening a new one. Your bug or idea may already be tracked.
- **Check the roadmap** (`ROADMAP.md`) before starting large feature work. Some features are
  planned for specific versions; it is best to discuss before building.
- **Open an issue first** for any non-trivial change (new feature, refactor, architecture change).
  This avoids wasted effort if the direction needs adjustment before code is written.

---

## Development Setup

### System Dependencies

**Linux (Debian/Ubuntu):**
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

**macOS:**
```bash
xcode-select --install
```

**Windows:**
- [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 11)

### Rust and Tauri CLI

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install the Tauri CLI
cargo install tauri-cli --version "^2.0.0" --locked
```

### rclone Cloud Backend

Google Drive, OneDrive, Dropbox, pCloud, and S3-compatible providers use rclone
as the cloud backend. Local development does not require provider OAuth client
IDs; use Settings -> Cloud Tools to install rclone, or put `rclone` on `PATH`.

Windows rclone mounts also require WinFsp. Use Settings -> Cloud Tools ->
Install WinFsp Driver when testing mounted cloud drives on Windows. This installs
the official WinFsp MSI and may require UAC/admin approval. See
[`CLOUD_DRIVES.md`](CLOUD_DRIVES.md) before changing mount behavior.

---

## Project Structure

```
SimpleFile/
+-- frontend/          # Shipping Svelte/Vite frontend
|   +-- src/main.ts    # Tauri web entry point
|   +-- src/lib/       # Typed API, workflows, provider modules, Svelte components
|   +-- src/vanilla-js/
|   |   +-- runtime/   # Live plain JavaScript imported by Svelte
|   |   +-- generated-svelte/ # Generated audit artifacts
|   +-- scripts/       # Frontend migration and bridge checks
|
+-- src-tauri/         # Rust/Tauri backend
|   +-- Cargo.lock     # Committed for reproducible desktop builds
|   +-- Cargo.toml
|   +-- src/
|       +-- cloud/     # Cloud drive plugin trait + registry
|       +-- *.rs       # Feature modules (fs_ops, archive, search, preview, git, ftp, ...)
|
+-- scripts/           # Repository checks and smoke tests
+-- docs/              # Project documentation
+-- .github/           # CI/CD workflows and templates
```

**Key files:**

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | All Tauri command registrations |
| `src-tauri/src/cloud/mod.rs` | `CloudPlugin` trait, plugin registry, `cloud_list_plugins` command |
| `src-tauri/src/fs_ops.rs` | Core file operations |
| `frontend/src/main.ts` | Shipping web bootstrap used by Tauri |
| `frontend/src/App.svelte` | Svelte app root and shell host |
| `frontend/src/lib/components/` | Svelte-rendered app surfaces and compatibility overlay template |
| `frontend/src/lib/api.ts` | Typed Tauri command wrappers |
| `frontend/src/lib/types.ts` | Frontend command/event contracts |
| `frontend/src/lib/legacyCloudPluginRegistry.ts` | Frontend plugin registry (discovers cloud plugins) |
| `frontend/src/lib/legacy-cloud-plugins/` | Svelte-side generic provider modules |
| `frontend/src/lib/legacyCloudManager.ts` | Generic cloud UI (provider-agnostic) |
| `frontend/src/vanilla-js/runtime/` | Live plain JavaScript runtime helpers |
| `frontend/src/vanilla-js/generated-svelte/` | Generated Svelte JavaScript/CSS audit artifacts |

---

## Adding a Cloud Storage Provider

Cloud drives use a plugin architecture. Adding a new provider requires exactly four steps and
no changes to any shared infrastructure file.

### 1. Backend: implement `CloudPlugin`

Create `src-tauri/src/cloud/<name>_plugin.rs`:

```rust
use crate::cloud::CloudPlugin;
use crate::models::{AuthField, CloudPluginMeta, MountConfig};

pub struct MyPlugin;

impl CloudPlugin for MyPlugin {
    fn meta(&self) -> CloudPluginMeta {
        CloudPluginMeta {
            id:           "myprovider".to_string(),
            name:         "My Provider".to_string(),
            icon:         r#"<svg …/>"#.to_string(),
            auth_type:    "credentials".to_string(),  // or "oauth2"
            auth_fields:  vec![
                AuthField { id: "username".to_string(), label: "Username".to_string(),
                            field_type: "text".to_string(), required: true,
                            placeholder: None, options: None },
                // … more fields
            ],
            capabilities: vec!["list".to_string(), "download".to_string(), /* … */],
            description:  "Short description shown in the connect dialog.".to_string(),
        }
    }

    fn remote_url(&self, config: &MountConfig) -> String {
        format!("myprovider://{}", config.user.as_deref().unwrap_or(""))
    }

    fn uses_rclone(&self) -> bool { true }   // set false if not rclone-backed

    #[cfg(unix)]
    fn restore_mount(&self, config: &MountConfig, mount_point: &str) -> Result<Option<u32>, String> {
        crate::myprovider::perform_myprovider_mount(config, mount_point).map(Some)
    }
}
```

Also create `src-tauri/src/myprovider.rs` with the actual Tauri commands
(`myprovider_auth`, `myprovider_list_folder`, etc.) and register them in `lib.rs`.

### 2. Backend: register the plugin

In `src-tauri/src/cloud/mod.rs`, add two lines:

```rust
pub mod myprovider_plugin;          // ← new module declaration

pub fn all_plugins() -> Vec<Box<dyn CloudPlugin>> {
    vec![
        Box::new(gdrive_plugin::GDrivePlugin),
        Box::new(pcloud_plugin::PCloudPlugin),
        Box::new(onedrive_plugin::OneDrivePlugin),
        Box::new(dropbox_plugin::DropboxPlugin),
        Box::new(s3_plugin::S3Plugin),
        Box::new(myprovider_plugin::MyPlugin),  // ← new entry
    ]
}
```

### 3. Frontend: implement the plugin contract

Create `frontend/src/lib/legacy-cloud-plugins/myprovider.ts` exporting a
default `LegacyCloudPlugin` object with:

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Must match the backend plugin id |
| `name` | string | Display name |
| `icon` | string | SVG markup or emoji |
| `authType` | string | `"oauth2"` or `"credentials"` |
| `renderAuthDialog(container, callbacks)` | function | Renders the connect form |
| `connect(formData)` | async function | Performs authentication |
| `refreshAuth(auth)` | async function | Refreshes expired tokens |
| `listFolder(auth, folderId)` | async function | Returns `Entry[]` |
| `download(auth, id, size, path, threads, opId, isGoogleDoc?)` | async function | Downloads a file |
| `upload(auth, parentId, localPath, opId)` | async function | Uploads a file |
| `createFolder(auth, parentId, name)` | async function | Creates a folder |
| `delete(auth, id, isFolder)` | async function | Deletes a file or folder |
| `rename(auth, id, newName, isFolder)` | async function | Renames an item |
| `mount(auth, name)` | async function | Mounts as a local drive |

Use the migrated providers in `frontend/src/lib/legacy-cloud-plugins`
(`gdrive.ts`, `onedrive.ts`, `dropbox.ts`, `pcloud.ts`, `s3.ts`) as reference
implementations.

### 4. Frontend: register the plugin

Add a `*.ts` module under `frontend/src/lib/legacy-cloud-plugins` and
export a default `LegacyCloudPlugin`. The registry discovers these modules with
Vite's eager glob loader, so there is no central list to edit.

```ts
import type { LegacyCloudPlugin } from '../legacyCloudPluginRegistry';

const myProviderPlugin: LegacyCloudPlugin = {
  id: 'myprovider',
  name: 'My Provider',
  // ...
};

export default myProviderPlugin;
```

That's it. The provider picker dialog, file browser, auth dialog rendering, token refresh, and
mount restore all work automatically through the plugin interface.

---

## Running the App

```bash
# Start in development mode (hot-reload frontend, debug backend)
cargo tauri dev
```

The app window opens automatically. Tauri runs the Svelte build hook before
launch, so rerun the command after frontend bundle changes. Backend changes
trigger a Rust recompile.

---

## Running Tests

**Backend unit tests:**
```bash
cd src-tauri
cargo test --locked --all-features
```

**Linting and format check:**
```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
```

**Frontend and app-shell checks:**
```bash
npm run check
```

**Full local release gate:**
```bash
npm run check:release
```

**Security audit:**
```bash
cd src-tauri
cargo audit --deny warnings --ignore RUSTSEC-2024-0370 --ignore RUSTSEC-2024-0411 --ignore RUSTSEC-2024-0412 --ignore RUSTSEC-2024-0413 --ignore RUSTSEC-2024-0414 --ignore RUSTSEC-2024-0415 --ignore RUSTSEC-2024-0416 --ignore RUSTSEC-2024-0417 --ignore RUSTSEC-2024-0418 --ignore RUSTSEC-2024-0419 --ignore RUSTSEC-2024-0420 --ignore RUSTSEC-2024-0429 --ignore RUSTSEC-2025-0075 --ignore RUSTSEC-2025-0080 --ignore RUSTSEC-2025-0081 --ignore RUSTSEC-2025-0098 --ignore RUSTSEC-2025-0100
```

The ignored advisories are accepted transitive warnings from the current Tauri/Linux GTK stack.
Any new advisory not listed there still fails CI. The CI pipeline runs these checks automatically
on every push and PR.

---

## Code Style

### Rust

- Follow `rustfmt` defaults (enforced by CI).
- Follow `clippy` recommendations (enforced by CI with `-D warnings`).
- Prefer `?` for error propagation over `unwrap()` / `expect()` in production code.
- All new Tauri commands must validate their path inputs via `validate_existing_path()` or
  `validate_name()` before use.
- For known rclone/WinFsp cloud mount paths, avoid direct background filesystem probes such as
  recursive `read_dir`, watcher setup, thumbnail generation, folder-size scans, and Windows
  volume/free-space probes. Use the rclone-aware helpers documented in `CLOUD_DRIVES.md` and the
  existing mount utilities.
- Async commands should use `tokio::spawn` for CPU-heavy work to avoid blocking the async runtime.

### Frontend

- New UI rendering should usually live under `frontend/src/lib/components/`.
- New frontend workflow, provider, and typed API modules should live under
  `frontend/src/lib/`.
- Live plain JavaScript runtime helpers belong under
  `frontend/src/vanilla-js/runtime/`.
- Generated Svelte JavaScript/CSS audit artifacts belong under
  `frontend/src/vanilla-js/generated-svelte/`.
- New Tauri command wrappers go in `frontend/src/lib/api.ts`, with command
  contracts in `frontend/src/lib/types.ts`.
- New cloud providers go in `frontend/src/lib/legacy-cloud-plugins/` -
  see "Adding a Cloud Storage Provider" above.
- Do not use `innerHTML` with user-controlled data. Use `textContent` or the `createElement`
  utility (without the `innerHTML` option).
- Escape all user-visible strings with `escapeHtml()` from `utils.js`.
- Cloud plugin auth dialogs may use `innerHTML` for their own templated markup, but must
  escape all user-supplied values before insertion.

### CSS

- Follow the existing CSS custom property (variable) pattern for colors and spacing.
- New features get their own file in `frontend/css/modules/`.
- Do not add inline styles in HTML or JS; use classes.

---

## Commit Messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <short description>

[optional body]

[optional footer]
```

**Types:**

| Type | When to use |
|------|------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `perf` | A performance improvement (no behavior change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or correcting tests |
| `docs` | Documentation only |
| `ci` | CI/CD configuration changes |
| `chore` | Dependency updates, tooling, other non-code changes |

**Examples:**
```
feat: add quick filter bar to narrow file listing
fix: prevent progress dialog from staying visible after paste error
perf: replace O(n) selectedEntries array with Set for O(1) lookups
docs: document validate_existing_path in CONTRIBUTING
```

Keep the subject line under 72 characters. Use the body for context and motivation, not mechanics.

---

## Branch Naming

```
<type>/<short-slug>
```

Examples:
- `feat/quick-filter-bar`
- `fix/progress-dialog-stuck`
- `perf/selection-set`
- `docs/contributing-guide`
- `ci/enforce-cargo-audit`

---

## Opening Issues

Use the provided templates:

- **Bug report** — Include: platform (OS + version), SimpleFile version, steps to reproduce,
  expected behavior, actual behavior, any relevant error messages.
- **Feature request** — Include: the problem you are trying to solve, your proposed solution,
  any alternatives you considered.

For security vulnerabilities, do **not** open a public issue. See
[Reporting Security Vulnerabilities](#reporting-security-vulnerabilities).

---

## Submitting a Pull Request

1. **Fork** the repository and create your branch from `main`.
2. **Keep PRs focused.** One feature or fix per PR. If you find an unrelated bug while working,
   open a separate issue or PR.
3. **Write tests** for new backend behavior. Frontend changes should include at minimum a manual
   test checklist in the PR description.
4. **Run the full check suite locally** before pushing:
   ```bash
   npm run check:release
   ```
5. **Fill in the PR template** completely. PRs with missing information will be asked to update
   before review.
6. **Link the issue** your PR addresses using `Closes #123` in the PR description.
7. **Be responsive** to review feedback. PRs with no activity for 30 days will be closed
   (you can always reopen).

### What we look for in review

- Correctness and edge case handling
- Security: no new path traversal vectors, no shell injection, no XSS
- Performance: no unnecessary allocations in hot paths, no blocking the async runtime
- Consistency with existing patterns (command registration, state management, error handling)
- Test coverage for new behavior

---

## Reporting Security Vulnerabilities

**Do not open a public GitHub issue for security vulnerabilities.**

Please report them privately via GitHub's
[Security Advisories](https://github.com/conniecombs/SimpleFile-Svelte/security/advisories/new) feature.
Include a description of the vulnerability, steps to reproduce, and potential impact. We aim to
acknowledge reports within 48 hours and publish a fix within 14 days for critical issues.

---

## License

By contributing to SimpleFile, you agree that your contributions may be incorporated into
SimpleFile and distributed under the SimpleFile Proprietary License in [`LICENSE`](../LICENSE).
You grant conniecombs a perpetual, worldwide, irrevocable, royalty-free license to use,
modify, reproduce, distribute, sublicense, and otherwise exploit your contribution as part
of SimpleFile.
