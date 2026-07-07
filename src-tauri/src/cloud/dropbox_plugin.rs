//! Dropbox cloud plugin metadata.
//!
//! This registers Dropbox as a first-class rclone-backed plugin in the shared
//! cloud provider registry.

use crate::cloud::CloudPlugin;
use crate::models::{CloudPluginMeta, MountConfig};

pub struct DropboxPlugin;

impl CloudPlugin for DropboxPlugin {
    fn meta(&self) -> CloudPluginMeta {
        CloudPluginMeta {
            id: "dropbox".to_string(),
            name: "Dropbox".to_string(),
            icon: "📦".to_string(),
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
            description:
                "Sign in with Dropbox through rclone to browse, transfer, and mount Dropbox."
                    .to_string(),
        }
    }

    fn remote_url(&self, config: &MountConfig) -> String {
        format!("dropbox://{}", config.user.as_deref().unwrap_or("account"))
    }

    fn uses_rclone(&self) -> bool {
        true
    }

    #[cfg(unix)]
    fn restore_mount(
        &self,
        _config: &MountConfig,
        _mount_point: &str,
    ) -> Result<Option<u32>, String> {
        Err("Dropbox mount restore is registered but not yet implemented.".to_string())
    }
}
