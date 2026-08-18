# Roadmap

This is the living plan for SimpleFile 0.1.x. Historical 1.x planning notes are
in [`archive/`](archive/README.md).

## Current status (0.1.0)

SimpleFile is a Linux file manager with a working browse, transfer, search,
archive, and inspection set. The shipping UI is Svelte 5. The backend is
Tauri 2 / Rust. Version metadata is 0.1.0.

**In the 0.1.0 build:**

- Tabs, dual pane, tree, breadcrumbs, Quick Access, bookmarks, recents
- List and grid views with configurable columns
- Create, rename, trash, copy, cut, paste, pack/unpack
- Context-aware Advanced Rename with live preview and undo
- Drag and drop inside the app and to other applications
- Recursive search, Quick Look, properties, checksums, EXIF, text compare
- ZIP / TAR / TAR.GZ / RAR, Git badges, duplicates, disk cleanup
- Signed GitHub updater channel

**Still open:**

- Broader accessibility review beyond the markup check
- More frontend integration tests (Playwright or equivalent)
- Revisit accepted RustSec advisories when Tauri/Wry drop those crates
- Smoother behavior on slow network mounts
- Optional confirmation when Advanced Rename would touch a very large tree

## Near term

1. Harden transfer, rename, and search against permission errors and vanished
   files.
2. Expand engine tests around rename, search options, and path helpers.
3. Finish remaining overlay migrations out of the legacy HTML template.
4. Tighten keyboard focus order in dialogs and the context menu.

## Later

- Saved Advanced Rename presets
- Richer smart-folder rules
- Better archive create options (compression level, format defaults)
- Thumbnail cache performance on large picture folders

## Out of scope for 0.1.x

- Official macOS or Windows builds
- Cloud-provider accounts as first-class places
- Replacing the system file picker for other applications beyond `xdg-mime`
  default-app registration
