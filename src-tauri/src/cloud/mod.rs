//! Plugin-based cloud drive system.
//!
//! ## How auto-discovery works
//!
//! Every cloud provider is a zero-sized struct that implements [`CloudPlugin`].
//! The [`all_plugins`] function is the single place that enumerates them;
//! adding a new provider only requires:
//!   1. Creating a new `<provider>_plugin.rs` in this module.
//!   2. Adding `pub mod <provider>_plugin;` below.
//!   3. Pushing `Box::new(<Provider>Plugin)` into `all_plugins()`.
//!
//! No other file needs to change — `lib.rs` registers the single generic
//! `cloud_list_plugins` command, and `mounts.rs` dispatches mount/restore
//! calls through the registry rather than a hardcoded `match`.

pub mod dropbox_plugin;
pub mod gdrive_plugin;
pub mod onedrive_plugin;
pub mod pcloud_plugin;
pub mod s3_plugin;

use crate::models::{CloudPluginMeta, MountConfig};

// ============================================================================
// Trait
// ============================================================================

/// Every cloud storage provider implements this trait.
///
/// The trait is intentionally minimal on the *Tauri-command* side — the
/// provider-specific commands (`gdrive_*`, `pcloud_*`, …) stay exactly as
/// they are.  The trait covers only the pieces needed by the shared mount
/// infrastructure (`mounts.rs`):
///   - metadata for the frontend connect dialog
///   - re-mounting a saved config after a reboot
///   - building the human-readable `remote://` URL shown in the sidebar
///   - advertising whether the provider uses rclone (so the config file is
///     cleaned up on unmount)
pub trait CloudPlugin: Send + Sync {
    /// Return static metadata consumed by the frontend.
    fn meta(&self) -> CloudPluginMeta;

    /// Re-mount a previously saved config during application startup.
    ///
    /// Returns `Ok(Some(pid))` for FUSE/rclone mounts that spawn a daemon,
    /// or `Ok(None)` for kernel mounts where there is no daemon PID to track.
    #[cfg(unix)]
    fn restore_mount(&self, config: &MountConfig, mount_point: &str)
        -> Result<Option<u32>, String>;

    /// Build the `remote://...` display URL stored in [`MountInfo`].
    fn remote_url(&self, config: &MountConfig) -> String;

    /// `true` when the provider is backed by rclone — used to decide whether
    /// the per-mount `.rclone.conf` file should be removed on unmount.
    #[allow(dead_code)]
    fn uses_rclone(&self) -> bool {
        false
    }
}

// ============================================================================
// Registry
// ============================================================================

/// Return every registered cloud plugin.
///
/// Each call allocates a small `Vec` of boxed zero-sized structs; the cost is
/// negligible for the handful of providers that exist.
pub fn all_plugins() -> Vec<Box<dyn CloudPlugin>> {
    vec![
        Box::new(gdrive_plugin::GDrivePlugin),
        Box::new(dropbox_plugin::DropboxPlugin),
        Box::new(pcloud_plugin::PCloudPlugin),
        Box::new(onedrive_plugin::OneDrivePlugin),
        Box::new(s3_plugin::S3Plugin),
    ]
}

/// Look up a plugin by its ID string (e.g. `"gdrive"`).
pub fn find_plugin(id: &str) -> Option<Box<dyn CloudPlugin>> {
    all_plugins().into_iter().find(|p| p.meta().id == id)
}

// ============================================================================
// Tauri command
// ============================================================================

/// Return the metadata for every registered cloud plugin.
///
/// The frontend calls this once on startup and uses the result to:
///   - Populate the "Connect cloud drive" picker.
///   - Render the provider-specific auth/connect dialog dynamically.
///   - Know which operations (upload, mount, …) each provider supports.
#[tauri::command]
pub fn cloud_list_plugins() -> Vec<CloudPluginMeta> {
    all_plugins().iter().map(|p| p.meta()).collect()
}
