# Contributing to SimpleFile

Thank you for contributing. SimpleFile is a Linux file manager built with
Rust/Tauri 2 and Svelte 5. Bug fixes, features, tests, and documentation are
all welcome.

## Before you start

- Search [existing issues](https://github.com/conniecombs/SimpleFile-Linux/issues)
  before opening a new one.
- Read the [roadmap](ROADMAP.md) before large feature work.
- Open an issue first for any non-trivial change so the approach can be
  agreed before code is written.

This repository is Linux-only. Do not add macOS or Windows product paths
unless a maintainer has accepted that scope change.

## Development setup

Follow [Development Setup](../README.md#development-setup) in the README for
system packages, Rust, Node 24, and `npm ci --prefix frontend`.

Run the desktop app from the repository root:

```bash
npm run dev
```

That script launches the Tauri CLI from the frontend toolchain. Tauri rebuilds
the Svelte bundle before the window opens.

## Project structure

See [architecture.md](architecture.md) for ownership boundaries. The short
version:

| Path | Role |
|---|---|
| `frontend/src/lib/components/` | Svelte UI |
| `frontend/src/lib/api.ts` / `types.ts` | Tauri contracts |
| `frontend/src/lib/advancedRenameEngine.ts` | Pure rename planner |
| `src-tauri/src/lib.rs` | Command registration |
| `src-tauri/src/fs_ops.rs` | Core file operations |
| `scripts/` | Repository checks |

## Tests and checks

```bash
npm run check              # frontend, scripts, invoke/updater/docs gates
npm run check:advanced-rename
npm run check:rust         # fmt, tests, clippy
npm run check:release      # full release gate, including cargo audit
```

Backend unit tests:

```bash
cd src-tauri
cargo test --locked --all-features
```

New backend behavior needs tests. Frontend behavior that can be expressed
without the DOM (such as rename planning) should get an engine test in
`scripts/check-advanced-rename.mjs` or an equivalent script.

## Code style

### Rust

- `rustfmt` and Clippy (`-D warnings`) are enforced in CI.
- Prefer `?` over `unwrap()` / `expect()` in production code.
- New commands must validate path inputs with `validate_existing_path()`,
  `validate_path_no_follow()`, or `validate_name()` before use.
- Keep CPU-heavy work off the async runtime (`spawn_blocking` or an equivalent).

### Frontend

- New rendering goes under `frontend/src/lib/components/`.
- New workflows go under `frontend/src/lib/`.
- New commands get a wrapper in `api.ts` and a contract in `types.ts`.
- Do not assign user-controlled data to `innerHTML`. Use `textContent` or
  Svelte text interpolation.
- Styles belong in `frontend/src/css/modules/`. Use existing CSS variables.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add keep-extension toggle to Advanced Rename
fix: number filtered rename targets without gaps
docs: document Advanced Rename tokens
```

| Type | Use |
|---|---|
| `feat` | User-visible feature |
| `fix` | Bug fix |
| `perf` | Performance only |
| `refactor` | No behavior change |
| `test` | Tests only |
| `docs` | Documentation only |
| `ci` | CI configuration |
| `chore` | Tooling or dependencies |

Keep the subject under 72 characters. Use the body for motivation, not a
narration of the diff.

## Branch names

```text
feat/advanced-rename-tokens
fix/batch-rename-parent-child
docs/user-guide
```

## Pull requests

1. Branch from `main`.
2. Keep the PR focused. Unrelated fixes belong in another PR.
3. Run `npm run check:release` before you push release-level or backend work.
   For documentation-only changes, `npm run check` is enough.
4. Fill in the pull request template and link the issue with `Closes #123`.
5. Update documentation when user-facing behavior changes.

Review looks for correctness, path and XSS safety, no blocked async work on
hot paths, and consistency with existing modules.

## Security reports

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).

## License

Contributions are included under the Apache License, Version 2.0 in
[`LICENSE`](../LICENSE) unless you state otherwise.
