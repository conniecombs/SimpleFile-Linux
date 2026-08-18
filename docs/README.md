# SimpleFile Documentation

This directory is the project documentation for SimpleFile 0.1.0, a Linux file
manager built with a Rust/Tauri 2 backend and a Svelte 5 frontend.

Start with the [README](../README.md) for install and development setup. Use
the guides below for product behavior, architecture, and contribution process.

## User documentation

| Document | Description |
|---|---|
| [User guide](user-guide.md) | Everyday browsing, file operations, search, archives, and settings |
| [Advanced Rename](advanced-rename.md) | Batch rename operations, template tokens, and preview rules |
| [Keyboard shortcuts](keyboard-shortcuts.md) | Complete shortcut reference |

## Project documentation

| Document | Description |
|---|---|
| [Architecture](architecture.md) | Repository layout and frontend/backend ownership |
| [Roadmap](ROADMAP.md) | Current 0.1.0 status and planned work |
| [Changelog](CHANGELOG.md) | Released and unreleased changes |
| [Updater and releases](UPDATER_RELEASE.md) | Signed updater setup and release checks |
| [Release process](../.github/RELEASE.md) | How GitHub Actions builds and publishes artifacts |

## Community

| Document | Description |
|---|---|
| [Contributing](CONTRIBUTING.md) | Setup, style, tests, and pull requests |
| [Code of conduct](CODE_OF_CONDUCT.md) | Expected behavior in project spaces |
| [Security policy](SECURITY.md) | Vulnerability reporting and supported versions |
| [Support](SUPPORT.md) | Where to ask questions and file bugs |

## Historical notes

Earlier planning reviews, migration notes, and the 1.1.0 release write-up live
in [`archive/`](archive/README.md). They are not the current product spec.

## Conventions

- User-facing docs describe Linux behavior only.
- Version numbers in live docs match `src-tauri/Cargo.toml` and
  `src-tauri/tauri.conf.json`.
- Links use the exact filenames in this directory so they work on Linux and
  GitHub.
