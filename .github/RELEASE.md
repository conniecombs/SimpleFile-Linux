# Release Process

How to publish a SimpleFile release from `main`. Operational updater detail
is in [`docs/UPDATER_RELEASE.md`](../docs/UPDATER_RELEASE.md).

## 1. Update version numbers

Keep these identical:

- `src-tauri/tauri.conf.json` — `version`
- `src-tauri/Cargo.toml` — package `version`
- `src-tauri/Cargo.lock` — `simplefile` package version
- [`README.md`](../README.md) — version badge
- [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) — notes and compare links

The release workflow fails if the tag or manual version does not match both
Rust/Tauri manifests. Commit a current `Cargo.lock`.

If the release changes Linux desktop integration, process launching, updater
behavior, or installers, also update [`docs/SECURITY.md`](../docs/SECURITY.md),
[`docs/SUPPORT.md`](../docs/SUPPORT.md), and the relevant README sections.

## 2. Merge the version bump

Open a pull request into `main`, wait for CI, then merge.

```bash
git checkout main
git pull origin main
```

## 3. Create a git tag

Tags use `vMAJOR.MINOR.PATCH`, for example `v0.1.0`.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 4. What the workflow does

`.github/workflows/release.yml`:

1. Validates the version against `Cargo.toml` and `tauri.conf.json`.
2. Runs the release quality gates: Rust format, Clippy, tests, Svelte
   build/types, invoke checks, updater config checks, and `cargo audit`.
3. Builds Linux x64 Debian, RPM, and AppImage artifacts.
4. Signs updater artifacts when `TAURI_SIGNING_PRIVATE_KEY` is set. Draft
   installer-only builds can use `src-tauri/tauri.local.conf.json`.
5. Creates or updates a draft GitHub release and uploads artifacts through
   `tauri-apps/tauri-action`.
6. Publishes only when the Linux build succeeds and `draft` is false.

## 5. Manual dispatch

1. Actions → Release → **Run workflow**.
2. Leave the version blank to use the checked-in manifest, or enter `0.1.0`
   or `v0.1.0`.
3. Choose whether the release stays a draft.

## Artifacts

| Type | Example |
|---|---|
| Debian package | `simplefile_0.1.0_amd64.deb` |
| RPM package | `simplefile-0.1.0-1.x86_64.rpm` |
| AppImage | `simplefile_0.1.0_amd64.AppImage` |
| Updater | `latest.json` and signatures |

Installed apps check
`https://github.com/conniecombs/SimpleFile-Linux/releases/latest/download/latest.json`.

## Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push/PR to `main` | Quality, frontend, audit, Linux backend build |
| `release.yml` | `v*` tags or manual | Version check, gates, Linux packages |
| `dependabot.yml` | Weekly | Cargo, npm, and Actions updates |

## Versioning

Semantic Versioning:

- **MAJOR** — breaking changes
- **MINOR** — backward-compatible features
- **PATCH** — backward-compatible fixes

The current line is 0.1.x. Pre-release examples: `v0.1.0-beta.1`.
