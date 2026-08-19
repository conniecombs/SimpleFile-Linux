# Updater Releases

SimpleFile uses the Tauri 2 updater plugin with GitHub Releases as the static
update server. Release builds can publish `latest.json`, signed update
artifacts, and `.sig` files. Installed apps check:

```text
https://github.com/conniecombs/SimpleFile-Linux/releases/latest/download/latest.json
```

See [`.github/RELEASE.md`](../.github/RELEASE.md) for the full release
procedure.

## One-time signing setup

Never commit the updater private key. Generate it locally:

```bash
mkdir -p .secrets
npm --prefix frontend exec -- tauri signer generate --ci -w .secrets/simplefile-updater.key
```

Put the public key from `.secrets/simplefile-updater.key.pub` in
`src-tauri/tauri.conf.json`. Put the private key content in the GitHub
repository secret `TAURI_SIGNING_PRIVATE_KEY`.

If the key has a password, also create `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

`.gitignore` excludes `.secrets/`.

## Version bump

Keep these identical:

- `src-tauri/tauri.conf.json` — `version`
- `src-tauri/Cargo.toml` — package `version`
- `src-tauri/Cargo.lock` — `simplefile` package version
- `README.md` — version badge
- `docs/CHANGELOG.md` — release notes

Current version is **0.1.0**.

## Release flow

1. Update the version files above and the changelog.
2. Merge to `main` after CI is green.
3. Create a tag such as `v0.1.0`, or run the **Release** workflow. Leave the
   manual version blank to use the checked-in manifest, or enter `0.1.0` or
   `v0.1.0`.
4. The workflow runs quality gates and builds Linux x64 artifacts. With
   `TAURI_SIGNING_PRIVATE_KEY` it signs updater artifacts and uploads
   `latest.json`. Without that secret, draft builds use
   `src-tauri/tauri.local.conf.json` and upload installers only.
5. Publish the GitHub release when ready. Draft releases are not returned by
   `releases/latest`, so installed apps only see published releases.

## Validation

```bash
npm run check:release
```

That runs the Svelte production build, script and invoke checks, updater
config checks, Rust formatting, tests, Clippy, and the dependency audit.

Local packaging without updater artifacts:

```bash
npm run release:local
```

Local signed bundle:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat .secrets/simplefile-updater.key)"
npm --prefix frontend exec -- tauri build --ci
```

The first updater-enabled release must be installed manually. Later published
releases can be installed from **Settings → App Updates**.
