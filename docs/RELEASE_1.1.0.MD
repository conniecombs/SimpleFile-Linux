# SimpleFile 1.1.0 Release Notes

Release date: 2026-05-29

## Summary

SimpleFile 1.1.0 is the first public release from the `SimpleFile-Linux`
repository and supersedes the unreleased local `v1.0.4` tag. It combines the
Svelte/Vite shell migration, release-readiness hardening, startup-location
fixes, safer file-operation conflict behavior, and Apache-2.0 project
licensing.

## Licensing

SimpleFile is licensed under the Apache License, Version 2.0. Third-party
libraries and tools remain governed by their own license terms.

## Installation

Linux users should install the package for their distribution or use the
portable AppImage:

```text
simplefile_1.1.0_amd64.deb
simplefile-1.1.0-1.x86_64.rpm
simplefile_1.1.0_amd64.AppImage
```

The first updater-enabled release must be installed manually. After that,
future published releases can be installed through Settings -> App Updates.

## Major Changes

- Svelte/Vite frontend shell is now the release entry point.
- File-list column resizing now matches familiar desktop file-manager behavior.
- Start Location -> Custom Path now supports selecting and persisting a path.
- Copy, cut, paste, drag/drop, and dual-pane transfers now flow through the
  transfer manager with stable operation IDs and progress events.
- Copy and move conflict paths are covered so existing destination files are not
  silently overwritten.
- Release build tooling now includes local installer-only bundle support and
  signed updater release support.
- Project metadata, README, updater configuration, support links, release docs,
  and contribution terms now point at `conniecombs/SimpleFile-Linux`.

## Validation

The local 1.1.0 release candidate was validated with:

```bash
npm run check:release
npm run build:tauri:local
```

`npm run check:release` includes Svelte checks/builds, legacy frontend checks,
Tauri invoke parity checks, updater configuration checks, Rust formatting, Rust
tests, Clippy with warnings denied, and Rust dependency audit.

## Release Artifacts

The GitHub release workflow builds:

- Linux x64 Debian package, RPM package, and AppImage artifacts
- Signed updater artifacts and `latest.json` when the updater signing secret is
  configured

The release workflow requires the GitHub secret `TAURI_SIGNING_PRIVATE_KEY`.
If the signing key is password-protected, it also requires
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## Known Operational Notes

- The local `build:tauri:local` command intentionally disables updater artifact
  signing through `src-tauri/tauri.local.conf.json`; it is for local packaging
  validation only.
- The real GitHub release workflow keeps updater signing enabled and fails if
  the signing secret is missing.
- The first updater-enabled release must be installed manually by existing
  users. Later published releases can update through Settings -> App Updates.
