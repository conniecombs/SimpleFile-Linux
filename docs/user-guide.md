# User Guide

SimpleFile is a Linux desktop file manager for local folders, mounted volumes,
and archives. This guide covers the shipping 0.1.0 interface.

Open **Help** from the command palette (`Ctrl+Shift+P`) for the in-app shortcut
list. The complete shortcut table is in [keyboard-shortcuts.md](keyboard-shortcuts.md).

## Window layout

- **Sidebar:** Quick Access (XDG user directories), bookmarks, recent
  locations, mounted volumes, smart folders, and the folder tree.
- **Toolbar:** Back/forward, path bar, search, list/grid, dual pane, preview,
  and a View and tools menu. File operations stay on the context menu,
  shortcuts, and command palette.
- **File list:** List or grid view of the current folder, with a tab strip on
  each pane and optional dual pane.
- **Preview pane:** Optional side panel for the highlighted item.
- **Status bar:** Selection count, size, and free space on the active volume.

Each pane has its own tabs. Dual pane (`F6`) puts a second folder beside the
first for copy and move work. Each pane is its own session: path, history, tabs,
selection, sort, list/grid, hidden files, filter, and search. The sidebar, tree,
toolbar (back/forward/up/path/search), and `Ctrl+L` always act on the
**active** pane. `Tab` switches panes. Clicking a tab on the other pane
activates that pane.

## Opening locations

- Click Quick Access, bookmarks, recents, or a tree folder.
- Type or paste a path in the path bar (`Ctrl+L`) and press Enter. Path
  autocomplete suggests child folders as you type.
- Drop a folder onto the window, or launch SimpleFile with a folder argument.
- Search results and smart folders open as a result list rather than a normal
  directory.

Hidden files stay hidden until you toggle them (`Ctrl+H` or Settings).

## Browsing

- **List view** shows configurable columns: name, size, item count, date, and
  type. Right-click a column header to show or hide columns. Drag the divider
  between headers to resize.
- **Grid view** shows icons. Icon size is in View and tools when grid is on.
- Click a column header to sort. Click again to reverse the order.
- Arrow keys, Home, and End move the highlight. Type-ahead jumps to names that
  start with the letters you type.

## Selecting files

- Click to select one item.
- `Ctrl+Click` toggles an item.
- `Shift+Click` or `Shift+Arrow` selects a range.
- Click and drag on empty list or grid space for rubber-band selection.
- `Ctrl+A` selects everything in the current view.
- `Escape` clears the selection and closes menus.

Selection is per pane. Actions apply to the active pane.

## File operations

| Action | How |
|---|---|
| Open | Enter, double-click, or the context menu |
| Open With | Context menu; pick a trusted executable |
| New folder | `Ctrl+N` |
| New file | `Ctrl+Shift+N` |
| Rename one item | `F2` |
| Rename many items | Context menu → **Advanced Rename...** |
| Copy / Cut / Paste | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` |
| Clipboard history | `Ctrl+Shift+V` |
| Delete | `Delete` (trash when available, otherwise permanent delete) |
| Pack into folder | Context menu |
| Unpack folder | Context menu on a folder |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` |

Copy and move conflicts offer keep both, replace, skip, cancel, and
apply-to-remaining. Transfers report progress and can be cancelled.

Drag items onto a folder, the other pane, the tree, Quick Access, bookmarks,
recents, or breadcrumbs. Internal drops move by default. Drops from other apps
copy by default. You can also drag files out to other applications.

Color labels are stored locally and do not change the files on disk.

## Advanced Rename

Select one or more items, then open **Advanced Rename** from the context menu
or command palette. The dialog shows a live preview, persists your last-used
settings, and supports undo after apply.

See [advanced-rename.md](advanced-rename.md) for every operation and token.

## Search

- `/` or `Ctrl+Shift+F` filters the current folder by name.
- `Ctrl+F` focuses recursive search.
- Advanced search can match file contents, include hidden files, filter by
  extension, size, and date, and limit depth or result count.
- Searches are cancellable. Results stream in as the backend finds them.
- Save the current search as a smart folder from the results header.

## Inspection

- **Space** opens Quick Look for supported text, images, PDFs, and archive
  entries.
- The preview pane shows the same kinds of content beside the list.
- **Properties** shows path, size, dates, type, permissions, symlink target,
  checksums, and image EXIF when the file is an image.
- **Compare Files** diffs two selected UTF-8 text files side by side.
- Git badges appear when Git integration is enabled and the folder is a
  repository.
- **Find Duplicates** (`Ctrl+Shift+D`) groups same-size files by SHA-256 and
  lets you keep one copy in each group.
- Disk cleanup finds large files and duplicate groups in the current tree.

## Archives

SimpleFile can list, extract, and create ZIP, TAR, TAR.GZ/TGZ, and RAR when
the required tooling is available. Extraction refuses path-traversal entries.
RAR support can be installed from Settings if it is missing.

## Drives and locations

The sidebar lists `/`, `/home`, `/mnt`, `/media`, and `/run/media/$USER`.
UDisks2 notifies the app when volumes appear or disappear. The status bar
shows free and total space for the active location.

## Settings

Open Settings from the toolbar or command palette.

- Dark or light theme
- Startup location: Home, last used, or a custom path
- Persist tabs across launches
- Default view, icon size, hidden files
- Confirm before delete
- Git integration
- Register SimpleFile as the default file manager (`xdg-mime`)
- App updates from the signed GitHub channel
- About dialog with version and project links

Most view preferences are also saved automatically as you change them.
