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

## Project Structure

```
SimpleFile/
+-- frontend/          # Shipping Svelte/Vite frontend
|   +-- src/main.ts    # Tauri web entry point
|   +-- src/lib/       # Typed API, workflows, and Svelte components
|   +-- src/vanilla-js/
|   |   +-- runtime/   # Live plain JavaScript imported by Svelte
|   |   +-- generated-svelte/ # Generated audit artifacts
|   +-- scripts/       # Frontend migration and bridge checks
|
+-- src-tauri/         # Rust/Tauri backend
|   +-- Cargo.lock     # Committed for reproducible desktop builds
|   +-- Cargo.toml
|   +-- src/
|       +-- *.rs       # Feature modules (fs_ops, archive, search, preview, git, ...)
|
+-- scripts/           # Repository checks and smoke tests
+-- docs/              # Project documentation
+-- .github/           # CI/CD workflows and templates
```

**Key files:**

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | All Tauri command registrations |
| `src-tauri/src/fs_ops.rs` | Core file operations |
| `frontend/src/main.ts` | Shipping web bootstrap used by Tauri |
| `frontend/src/App.svelte` | Svelte app root and shell host |
| `frontend/src/lib/components/` | Svelte-rendered app surfaces and compatibility overlay template |
| `frontend/src/lib/api.ts` | Typed Tauri command wrappers |
| `frontend/src/lib/types.ts` | Frontend command/event contracts |
| `frontend/src/vanilla-js/runtime/` | Live plain JavaScript runtime helpers |
| `frontend/src/vanilla-js/generated-svelte/` | Generated Svelte JavaScript/CSS audit artifacts |

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
- Async commands should use `tokio::spawn` for CPU-heavy work to avoid blocking the async runtime.

### Frontend

- New UI rendering should usually live under `frontend/src/lib/components/`.
- New frontend workflow and typed API modules should live under
  `frontend/src/lib/`.
- Live plain JavaScript runtime helpers belong under
  `frontend/src/vanilla-js/runtime/`.
- Generated Svelte JavaScript/CSS audit artifacts belong under
  `frontend/src/vanilla-js/generated-svelte/`.
- New Tauri command wrappers go in `frontend/src/lib/api.ts`, with command
  contracts in `frontend/src/lib/types.ts`.
- Do not use `innerHTML` with user-controlled data. Use `textContent` or the `createElement`
  utility (without the `innerHTML` option).
- Escape all user-visible strings with `escapeHtml()` from `utils.js`.

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
[Security Advisories](https://github.com/conniecombs/SimpleFile-Linux/security/advisories/new) feature.
Include a description of the vulnerability, steps to reproduce, and potential impact. We aim to
acknowledge reports within 48 hours and publish a fix within 14 days for critical issues.

---

## License

By contributing to SimpleFile, you agree that your contributions may be incorporated into
SimpleFile and distributed under the Apache License, Version 2.0, in
[`LICENSE`](../LICENSE). Unless you explicitly state otherwise, submitted
contributions are licensed under Apache-2.0.
