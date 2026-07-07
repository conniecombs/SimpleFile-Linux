//! Microsoft `OneDrive` cloud plugin — metadata + mount-restore logic.
//!
//! The actual Tauri commands (`onedrive_start_auth`, `onedrive_list_folder`, …)
//! live in `onedrive.rs`; this file only provides the [`CloudPlugin`]
//! implementation that the shared plugin registry needs.

use crate::cloud::CloudPlugin;
use crate::models::{CloudPluginMeta, MountConfig};

/// Zero-sized marker struct for the `OneDrive` plugin.
pub struct OneDrivePlugin;

impl CloudPlugin for OneDrivePlugin {
    fn meta(&self) -> CloudPluginMeta {
        CloudPluginMeta {
            id: "onedrive".to_string(),
            name: "Microsoft OneDrive".to_string(),
            icon: r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M14.5 9.5a6 6 0 0 0-11.28 2.1A4.5 4.5 0 0 0 4 20.5h15a3.5 3.5 0 0 0 .44-6.97A6 6 0 0 0 14.5 9.5z" fill="#0078D4"/></svg>"##.to_string(),
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
            description: "Sign in with Microsoft through rclone to browse, transfer, and mount OneDrive."
                .to_string(),
        }
    }

    fn remote_url(&self, config: &MountConfig) -> String {
        format!("onedrive://{}", config.user.as_deref().unwrap_or(""))
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
        crate::onedrive::perform_onedrive_mount(config, mount_point).map(Some)
    }
}
