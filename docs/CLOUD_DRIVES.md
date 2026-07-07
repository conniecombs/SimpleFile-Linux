# Cloud Drives, rclone, and WinFsp

This document explains how SimpleFile handles cloud providers, local cloud mounts,
rclone, and WinFsp.

## Overview

SimpleFile uses [rclone](https://rclone.org/) as the shared backend for cloud
providers such as Google Drive, OneDrive, Dropbox, pCloud, and S3-compatible
storage. rclone handles provider sign-in, remote configuration, cloud browsing,
transfers, cloud-to-cloud copy/move operations, and mount processes.

On Windows, `rclone mount` uses [WinFsp](https://winfsp.dev/) to expose a cloud
remote through the filesystem. WinFsp is a Windows filesystem driver/runtime.
It is only required for mounted cloud drives on Windows; cloud browsing and
transfers through rclone do not require WinFsp unless a mount is created.

SimpleFile intentionally uses WinFsp rather than Dokany for rclone mounts because
WinFsp is the Windows mount runtime supported by rclone. Windows rclone mounts
are started in network-drive mode with full VFS caching so Windows treats the
remote as a higher-latency filesystem instead of a fast local disk.

## Installing rclone and WinFsp

Open **Settings -> Cloud Tools**.

- **Install rclone** downloads the current rclone build from
  `downloads.rclone.org`, extracts the rclone binary, and stores it in the
  app-local rclone directory. SimpleFile also uses a system `rclone` found on
  `PATH` when one is already available.
- **Install WinFsp Driver** is shown separately so users know this installs a
  Windows filesystem driver/runtime. It downloads the latest official WinFsp
  MSI from the WinFsp GitHub releases page and runs it with Windows installer
  UI. Windows may show an administrator/UAC prompt and may request a restart.

The separate WinFsp button is intentional. rclone is a command-line cloud tool;
WinFsp is a Windows driver/runtime. Users should be able to see and approve
those installs independently.

## Windows Mount Locations

SimpleFile no longer mounts rclone cloud drives inside the app-data folder on
Windows. Instead, Windows rclone mounts are assigned drive letters, starting
from high letters such as `Z:\` and moving downward when letters are already in
use.

The selected drive letter is stored with the mount configuration so the same
remote can reuse the same mount point across restarts when the letter remains
available. In the drive list, these saved letters are treated as `Cloud` drives.

This makes cloud mounts behave closer to removable or network drives and avoids
exposing app-data paths as the normal user-facing mount location.

On Windows, SimpleFile passes `--network-mode` to `rclone mount` and uses
`--vfs-cache-mode full` for writable mounts. The network-drive mode reduces
Windows Explorer-style assumptions about local-disk speed and reliability, while
full VFS caching gives rclone a local cache for write-heavy operations.

## Responsiveness Safeguards

Mounted cloud drives can block inside WinFsp or rclone when a provider, network,
or mount process is unhealthy. To prevent SimpleFile from hard-freezing during
normal browsing, known rclone drive-letter mounts are handled differently from
ordinary local folders:

- Directory listing uses `rclone lsjson` mapped back to local drive-letter paths
  instead of direct `std::fs::read_dir` calls.
- File watchers are disabled on mounted cloud paths.
- Automatic thumbnails and previews are disabled on mounted cloud paths.
- Folder-size scans and detailed recursive properties are disabled on mounted
  cloud paths.
- Windows volume-name and free-space probes are skipped for saved cloud drive
  letters.
- rclone mount liveness checks avoid probing drive roots when a mount process
  cannot be found.
- Copy and move operations that involve a mounted rclone path are routed through
  `rclone copy`, `rclone copyto`, or `rclone moveto` instead of streaming bytes
  through the WinFsp drive from SimpleFile.

Explicitly opening, copying, or moving a cloud file can still touch the mounted
remote and may be slow if the provider or rclone process is unhealthy. The
guardrails above are meant to keep passive UI actions, selection, and ordinary
folder navigation from triggering the blocking filesystem calls that can wedge a
WinFsp mount.

## Troubleshooting

If mounting fails with a WinFsp error on Windows:

1. Open **Settings -> Cloud Tools**.
2. Confirm rclone is installed.
3. Confirm WinFsp is installed, or use **Install WinFsp Driver**.
4. Restart SimpleFile if Windows requested a restart after the WinFsp install.
5. Try the mount again from Remote Drives.

If a mounted cloud drive becomes unresponsive:

1. Try unmounting it from Remote Drives.
2. If the app cannot respond because rclone or WinFsp is blocked, close the
   corresponding `rclone` process from Task Manager.
3. Reopen SimpleFile and mount the remote again.

If a preferred drive letter is already taken, SimpleFile chooses another
available high drive letter and persists the new mount point.

## Security and Data Storage

Provider authorization happens in the provider's browser-based sign-in flow
through rclone. SimpleFile does not collect cloud account passwords or MFA
codes.

Cloud credentials and OAuth tokens may be stored by rclone in its local config,
or by SimpleFile mount configuration when needed for restore. Treat those local
configuration files as sensitive.

## Credits

- rclone was created by Nick Craig-Wood and is maintained by the rclone
  contributors. SimpleFile uses rclone for cloud remotes, browsing, transfers,
  cloud-to-cloud operations, and mount processes.
- WinFsp was created by Bill Zissimopoulos and is maintained by the WinFsp
  contributors. SimpleFile uses WinFsp through rclone for Windows cloud drive
  mounts.
