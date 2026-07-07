# Release Process

This document describes how to create a new SimpleFile release from the `main` branch.

## Automated Releases

Releases are automated with GitHub Actions through `.github/workflows/release.yml`.

### 1. Update Version Numbers

Update the version in these files and keep them identical:

- `src-tauri/tauri.conf.json` — `version` field
- `src-tauri/Cargo.toml` — package `version` field
- [`README.md`](../README.md) — version badge
- [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) — release notes and compare links

Release workflow validation fails if the tag/manual version does not match both Rust/Tauri manifest versions.
`src-tauri/Cargo.lock` must also be committed and current so release builds use the reviewed dependency graph.
For releases that change Linux desktop integration, process launching, updater
behavior, or installer behavior, update [`docs/SECURITY.md`](../docs/SECURITY.md),
[`docs/SUPPORT.md`](../docs/SUPPORT.md), and the relevant README sections.

### 2. Merge the Version Bump

Open a pull request into `main`, wait for CI, then merge.

```bash
git checkout main
git pull origin main
```

### 3. Create a Git Tag

Tags must use `vMAJOR.MINOR.PATCH` format, for example `v1.0.0`.

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 4. Automated Build Process

The release workflow will:

1. Validate the release version against `Cargo.toml` and `tauri.conf.json`.
2. Run release quality gates: Rust formatting, Clippy, tests, Svelte build/type checks,
   frontend/backend invoke checks, updater configuration checks, and Rust dependency audit.
3. Build the configured Linux x64 release artifacts.
4. Resolve updater signing mode. Draft releases can build installer-only artifacts
   without signing secrets; published updater releases require `TAURI_SIGNING_PRIVATE_KEY`.
5. Create or update a draft GitHub release and upload installer artifacts, signed updater
   artifacts, signatures, and `latest.json` through
   `tauri-apps/tauri-action@action-v1.0.0`.
6. Keep tag-triggered releases as drafts by default so assets can be reviewed before publishing.
7. Publish the release only after the Linux build succeeds when manual `draft=false` is selected.

### 5. Manual Release

You can also trigger a release manually:

1. Go to Actions → Release.
2. Click **Run workflow**.
3. Leave the version blank to use the checked-in manifest version, or enter an
   explicit version such as `1.0.0` or `v1.0.0`.
4. Choose whether to create a draft release.

If `draft` is set to `false`, the workflow publishes the release after the Linux build succeeds.

## Release Artifacts

Each release may include the following artifacts, depending on Tauri bundler output:

| Artifact Type | Example File |
|---------------|--------------|
| Debian package | `simplefile_x.x.x_amd64.deb` |
| RPM package | `simplefile-x.x.x-1.x86_64.rpm` |
| AppImage | `simplefile_x.x.x_amd64.AppImage` |
| Updater | `latest.json`, updater bundle signatures, and Linux updater artifacts |

## Auto-Update

SimpleFile uses Tauri's updater plugin with GitHub Releases as the static update server.
The app checks `https://github.com/conniecombs/SimpleFile-Linux/releases/latest/download/latest.json`.

### Setup Requirements

1. **Generate signing keys:**
   ```bash
   mkdir -p .secrets
   npm --prefix frontend exec -- tauri signer generate --ci -w .secrets/simplefile-updater.key
   ```

2. **Add secrets to GitHub:**
   - `TAURI_SIGNING_PRIVATE_KEY` — private signing key content
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — optional private key passphrase

3. **Keep `src-tauri/tauri.conf.json` updater settings enabled:**
   - `bundle.createUpdaterArtifacts` must be `true`.
   - `plugins.updater.pubkey` must contain the updater public key.
   - `plugins.updater.endpoints` must point at the GitHub release `latest.json`.

Draft release builds can run without signing secrets. In that case, the workflow
uses `src-tauri/tauri.local.conf.json` and uploads installer artifacts only.
Published releases with updater artifacts still require `TAURI_SIGNING_PRIVATE_KEY`.

The first updater-enabled release must be installed manually by existing users.
After that, future published releases can be installed through Settings -> App Updates.
See [`docs/UPDATER_RELEASE.md`](../docs/UPDATER_RELEASE.md) for the operational checklist.

## CI/CD Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to `main`, manual dispatch | Rust format, Clippy, tests, Svelte/frontend checks, frontend/backend invoke checks, dependency audit/review, and Linux backend build verification with the committed lockfile |
| `release.yml` | Tag push (`v*`), manual dispatch | Version validation, release quality gates, Linux Tauri release packaging, installer upload via Tauri Action, optional publishing |
| `dependabot.yml` | Weekly schedule | Dependency update pull requests for Cargo and GitHub Actions |

## Updater Signing

Published updater releases require `TAURI_SIGNING_PRIVATE_KEY`. If the private
key has a passphrase, also set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## Versioning

SimpleFile follows Semantic Versioning:

- **MAJOR**: breaking changes
- **MINOR**: backward-compatible features
- **PATCH**: backward-compatible fixes and release/process improvements

Pre-release examples: `v1.0.0-beta.1`, `v1.0.0-rc.1`.
