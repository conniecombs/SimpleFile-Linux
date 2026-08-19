# Architecture

SimpleFile is a Linux desktop app. The Rust backend talks to the filesystem,
and the Svelte frontend renders the shell. Tauri 2 hosts both in one process.

```text
SimpleFile-Linux/
|-- frontend/                 Svelte 5 + Vite UI
|   |-- src/main.ts           Web entry
|   |-- src/App.svelte        Shell host and overlays
|   |-- src/css/              Stylesheet modules
|   `-- src/lib/
|       |-- api.ts            Typed Tauri command wrappers
|       |-- types.ts          Command and event contracts
|       |-- tauri.ts          Invoke/listen implementation
|       |-- advancedRenameEngine.ts
|       |-- app/              App startup and pane workflows
|       `-- components/       Svelte surfaces
|-- src-tauri/                Rust / Tauri backend
|   |-- src/lib.rs            Command registration
|   |-- src/fs_ops.rs         Create, copy, move, rename, trash
|   |-- src/archive.rs
|   |-- src/search.rs
|   |-- src/preview.rs
|   |-- src/drives.rs
|   `-- tauri.conf.json
|-- scripts/                  Repository checks
|-- docs/
`-- com.simplefile.SimpleFile.yml
```

## Frontend

`frontend/src/App.svelte` mounts the layout shell and standalone overlays
(duplicates, Advanced Rename). Most chrome is Svelte. A small
`legacy-shell-template.html` still hosts older modal markup that action code
addresses by element id (archives, keyboard help, About, progress).

The toolbar is navigation and view controls. File operations belong on the
context menu, keyboard shortcuts, and command palette. Settings is a
sectioned preferences surface (`Appearance`, `Browser`, `Startup`, `Files`,
`Integration`, `About`).

State lives in `frontend/src/lib/app/state.svelte.ts`. Browse state is a
`PaneSession` per pane (`frontend/src/lib/paneSession.ts`): path, listing,
selection, history, tabs, sort, view, hidden files, filter, and search. Dual
pane is two sessions. Shared chrome (sidebar, tree, toolbar, tab bar) reads and
writes the active session. Clipboard, undo, settings, and theme stay global.

File-list, tab, search, and transfer workflows sit beside it under
`frontend/src/lib/`. New UI belongs in `frontend/src/lib/components/`. New
Tauri calls belong in `api.ts` with a matching contract in `types.ts`.

Advanced Rename is the reference for this split: a pure engine, a storage
helper, a Svelte dialog, and a thin workflow that calls `batch_rename`.

## Backend

`src-tauri/src/lib.rs` registers every command. Feature modules own one
concern each:

| Module | Responsibility |
|---|---|
| `fs_ops.rs` | Directory listing and mutating file operations |
| `archive.rs` | List, extract, and create archives |
| `search.rs` | Cancellable recursive search |
| `preview.rs` | Text, image, and thumbnail reads |
| `metadata.rs` | Image size and EXIF |
| `checksum.rs` / `sha256.rs` | Hashes, with SHA-NI on supported CPUs |
| `drives.rs` / `drives_dbus.rs` | Volumes and UDisks2 |
| `watcher.rs` | Directory change events |
| `git.rs` | Repository and per-file status |
| `cleanup.rs` | Large files and duplicate groups |
| `compare.rs` | UTF-8 text diffs |
| `open_with.rs` / `terminal.rs` | Scoped process launch |
| `updater.rs` | Version and update checks |

Path inputs go through the validators in `utils.rs` (`validate_name`,
`validate_existing_path`, `validate_path_no_follow`) before use. Batch rename
stages each item under a unique temporary name so swaps and case-only changes
cannot collide.

## IPC

The frontend never talks to the filesystem directly. It calls named Tauri
commands. `scripts/check-tauri-invokes.mjs` fails if a frontend wrapper does
not match a registered command.

Long work (copy, search, cleanup) emits progress events. The UI binds those
events to the progress dialog or a dedicated overlay.

## Persistence

| Store | Contents |
|---|---|
| `localStorage` | Settings, tabs, bookmarks, recents, color labels, Advanced Rename settings, recent searches |
| SQLite (`db.rs`) | Smart folders and backend tags when used |
| GitHub Releases | Signed updater `latest.json` |

## Checks

`npm run check` covers the frontend build, Svelte types, script syntax, invoke
contracts, updater config, accessibility markup, archive format comments,
Advanced Rename engine tests, Rust panic comments, and workflow wiring.

`npm run check:rust` runs `cargo fmt`, `cargo test --locked`, and Clippy.
`npm run check:release` adds the dependency audit.
