//! Google Drive cloud plugin — metadata + mount-restore logic.
//!
//! The actual Tauri commands (`gdrive_start_auth`, `gdrive_list_folder`, …)
//! live in `gdrive.rs`; this file only provides the [`CloudPlugin`]
//! implementation that the shared plugin registry needs.

use crate::cloud::CloudPlugin;
use crate::models::{CloudPluginMeta, MountConfig};

/// Zero-sized marker struct for the Google Drive plugin.
pub struct GDrivePlugin;

impl CloudPlugin for GDrivePlugin {
    fn meta(&self) -> CloudPluginMeta {
        CloudPluginMeta {
            id: "gdrive".to_string(),
            name: "Google Drive".to_string(),
            icon: r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 87.3 78" width="20" height="20"><path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0a7.3 7.3 0 0 0 .97 3.65z" fill="#0066da"/><path d="M43.65 25L29.9 1.2a8.25 8.25 0 0 0-3.3 3.3L.97 49.35A7.3 7.3 0 0 0 0 53h27.5z" fill="#00ac47"/><path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.68-13.3a7.3 7.3 0 0 0 .97-3.65H59.8l5.85 11.2z" fill="#ea4335"/><path d="M43.65 25L57.4 1.2A8.1 8.1 0 0 0 53.75 0H33.55a8.1 8.1 0 0 0-3.65.85z" fill="#00832d"/><path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.4 4.5-1.2z" fill="#2684fc"/><path d="M73.4 26.5l-13.3-23.05a8.25 8.25 0 0 0-3.3-3.3L43.65 25 59.8 53h27.45a7.3 7.3 0 0 0-.97-3.65z" fill="#ffba00"/></svg>"##.to_string(),
            auth_type: "oauth2".to_string(),
            auth_fields: vec![],
            capabilities: vec![
                "list".to_string(),
                "download".to_string(),
                "upload".to_string(),
                "create_folder".to_string(),
                "delete".to_string(),
                "rename".to_string(),
                "mount".to_string(),
            ],
            description: "Sign in with Google to browse and manage files on Google Drive. \
                Supports Google Workspace documents (Docs, Sheets, Slides) \
                with automatic PDF export on download."
                .to_string(),
        }
    }

    fn remote_url(&self, config: &MountConfig) -> String {
        format!("gdrive://{}", config.user.as_deref().unwrap_or(""))
    }

    fn uses_rclone(&self) -> bool {
        true
    }

    #[cfg(unix)]
    fn restore_mount(
        &self,
        config: &MountConfig,
        mount_point: &str,
    ) -> Result<Option<u32>, String> {
        crate::gdrive::perform_gdrive_mount(config, mount_point).map(Some)
    }
}
