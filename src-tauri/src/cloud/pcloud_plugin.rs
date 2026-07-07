//! pCloud cloud plugin — metadata + mount-restore logic.
//!
//! Normal pCloud connections are handled by the generic rclone commands. The
//! older provider-specific commands still live in `pcloud.rs` for legacy
//! sessions and compatibility.

use crate::cloud::CloudPlugin;
use crate::models::{CloudPluginMeta, MountConfig};

/// Zero-sized marker struct for the pCloud plugin.
pub struct PCloudPlugin;

impl CloudPlugin for PCloudPlugin {
    fn meta(&self) -> CloudPluginMeta {
        CloudPluginMeta {
            id: "pcloud".to_string(),
            name: "pCloud".to_string(),
            icon: r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path d="M19.59 7.13A7.5 7.5 0 0 0 5.1 9.5a5 5 0 0 0 .9 9.5h13a4 4 0 0 0 .59-7.87z" fill="#1ABCFE"/></svg>"##.to_string(),
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
            description: "Browse, transfer, and mount pCloud through rclone browser sign-in. \
                Supports both US and EU data regions."
                .to_string(),
        }
    }

    fn remote_url(&self, config: &MountConfig) -> String {
        format!("pcloud://{}", config.user.as_deref().unwrap_or(""))
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
        crate::pcloud::perform_pcloud_mount(config, mount_point).map(Some)
    }
}
