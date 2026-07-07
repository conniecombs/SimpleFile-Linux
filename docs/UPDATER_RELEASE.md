# SimpleFile Updater Releases

SimpleFile uses the Tauri 2 updater plugin with GitHub Releases as the static
update server. Release builds publish `latest.json`, signed update artifacts,
and `.sig` files to the latest GitHub release. Installed apps check:

```text
https://github.com/conniecombs/SimpleFile-Linux/releases/latest/download/latest.json
```

## One-time signing setup

The updater private key must never be committed. Generate it locally:

```bash
mkdir -p .secrets
npm --prefix frontend exec -- tauri signer generate --ci -w .secrets/simplefile-updater.key
```

The public key from `.secrets\simplefile-updater.key.pub` belongs in
`src-tauri/tauri.conf.json`. The private key content belongs in the GitHub
repository secret named `TAURI_SIGNING_PRIVATE_KEY`.

If you generate the key with a password, also create this repository secret:

```text
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

The current project `.gitignore` excludes `.secrets/` so local key files are not
tracked.

## Release flow

1. Update the version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. Commit the version bump and release notes.
3. Create a tag such as `v1.1.0`, or run the `Release` GitHub Actions workflow
   manually. Leave the manual version blank to use the checked-in manifest
   version, or enter either `1.1.0` or `v1.1.0`.
4. The release workflow runs quality gates and builds Linux x64 artifacts. If
   `TAURI_SIGNING_PRIVATE_KEY` is configured, it signs updater artifacts, uploads
   signatures, and uploads `latest.json`. Without that secret, draft release
   builds use `src-tauri/tauri.local.conf.json` and upload installer artifacts
   only.
5. Publish the GitHub release when ready. Published updater releases require the
   signing secret. Draft releases are not returned by the
   `releases/latest` endpoint, so installed apps only see published releases.

## Validation

Run these before pushing a release branch:

```bash
npm run check:release
```

That command runs the Svelte production build and bridge builds, legacy
frontend syntax/invoke/updater checks, Rust formatting, Rust tests, Clippy, and
the Rust dependency audit using the same advisory ignore policy as CI.

To also prove that local Linux packaging works without requiring the updater
private key, run:

```bash
npm run release:local
```

That command keeps release signing enabled in `tauri.conf.json`, but passes the
local Tauri config override in `src-tauri/tauri.local.conf.json` so updater
artifacts are not created. Signed updater artifacts are still required before
publishing an updater-enabled GitHub release.

To smoke-test settings persistence and startup location selection without
launching the desktop app, run:

```bash
npm run smoke:settings
```

That script verifies `simplefile-settings`, `simplefile-tabs`, Custom Path
startup, Home startup, Last Used startup, stale active-tab fallback, and Custom
Path fallback when the saved path is blank.

For a local signed Tauri bundle, load the private key content before building:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat .secrets/simplefile-updater.key)"
npm --prefix frontend exec -- tauri build --ci
```

The first updater-enabled release must be installed manually by existing users.
After that, future published releases can be installed through Settings ->
App Updates.
