# Advanced Rename

Advanced Rename changes many file and folder names in one step. Open it from
the context menu or the command palette after selecting one or more items.

The dialog is a Svelte form bound to a typed settings object. Preview and apply
use the same engine, so the names you see are the names that will be written.

## Scope

| Option | Effect |
|---|---|
| Include files inside selected folders | Recurse into selected directories |
| Include dotfiles | Keep names that start with `.` |
| Rename folders | Include directory names in the plan |
| Apply text ops to | Full name, name without extension, or extension only |

Selecting a folder does not rename that folder unless **Rename folders** is on.
Recursive mode collects children in the current sort order. Parent folders and
their children are never renamed in the same filesystem pass; files are renamed
first, then folders from deepest to shallowest.

## Operations

Enable only the operations you need. They run in this order:

1. **Filter targets** — keep names that match a string or regular expression,
   optional extensions, and files/folders/both. Invert flips the whole
   predicate, not just the name text.
2. **Template** — rebuild the name from tokens. See [Tokens](#tokens).
3. **Remove string** — delete matching text, optionally as regex.
4. **Replace string** — find and replace. Regex replacements support `$1`
   capture groups.
5. **Trim whitespace** — start, end, or both, with optional space collapsing.
6. **Add string** — prefix, suffix, before the extension, or at a character
   index (0 is the start of the chosen part).
7. **Capitalize** — first letter, each word, Title Case, sentence case, UPPER,
   or lower. Title Case keeps small words such as *of* and *the* lowercase
   unless they are the first or last word.
8. **Separators** — convert spaces, dashes, underscores, or dots. Dots-to-spaces
   does not replace the extension dot when applying to the full name.
9. **Sequential numbering** — start, step, pad width, position, and separator.
   Numbers are assigned after filtering, so there are no gaps.
10. **Extension** — lowercase, uppercase, set, or remove. Disabled when the
    selection is folders only.
11. **Sanitize** — replace `/`, control characters, `<>:"|?*\`, and trailing
    dots or spaces. On by default.

The **Apply text ops to** control applies to remove, replace, trim, insert,
capitalize, separators, and numbering.

Invalid regular expressions are reported on the rule. Duplicate destination
names and empty or illegal names are marked in the preview. **Rename** stays
disabled until every row is valid and at least one name would change.

## Tokens

Date tokens without a `now_` prefix use the file's modified time. `{n}` uses
the numbering start, step, and pad even if Sequential Numbering is off.

| Token | Value |
|---|---|
| `{base}` | Name without extension |
| `{ext}` | Extension, including compound suffixes such as `tar.gz` |
| `{name}` | Full original name |
| `{parent}` | Parent folder name |
| `{n}` | Sequence number |
| `{yyyy}` `{mm}` `{dd}` | File modified date |
| `{hh}` `{min}` `{ss}` | File modified time |
| `{date}` `{time}` | File modified `YYYY-MM-DD` and `HHMMSS` |
| `{mtime}` | Raw modified string from the backend |
| `{now}` `{now_date}` `{now_time}` | Current date and time |
| `{now_yyyy}` `{now_mm}` `{now_dd}` `{now_hh}` `{now_min}` `{now_ss}` | Current date parts |
| `{size}` | Size in bytes |
| `{type}` | `Folder`, `JPG File`, or `File` |
| `{kind}` | `file` or `folder` |
| `{tag}` | Color label, if set |
| `{tags}` | Joined labels |
| `{git}` | Per-file Git status when available |
| `{width}` `{height}` | Image pixel size |
| `{camera}` | EXIF Make and Model |
| `{date_taken}` | EXIF DateTimeOriginal, sanitized for filenames |
| `{exif:Tag}` | Any EXIF field, for example `{exif:LensModel}` |

Image tokens are listed when the selection contains images. EXIF is loaded only
when the template uses those tokens.

## Preview, apply, and undo

The preview shows up to 500 rows and a count of any remaining targets. Changed
rows are highlighted. Invalid rows show the reason.

Apply uses the Rust `batch_rename` command, which stages each item under a
temporary name so case-only changes and name swaps succeed. After a successful
rename you can undo from the toast or with `Ctrl+Z`. Redo is also supported.

Settings are saved to `localStorage` and restored the next time the dialog
opens.

## Engine and tests

The rename planner lives in `frontend/src/lib/advancedRenameEngine.ts`. It has
no DOM or Tauri dependency. Persistence is in
`frontend/src/lib/advancedRenameStorage.ts`. The dialog is
`frontend/src/lib/components/advanced-rename/AdvancedRenameOverlay.svelte`.

Run the engine checks with:

```bash
npm run check:advanced-rename
```
