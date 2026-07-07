//! S3-compatible cloud plugin metadata.
//!
//! Registers S3-compatible storage (AWS S3, `MinIO`, Backblaze B2 S3 API,
//! Wasabi, etc.) as an rclone-backed provider.

use crate::cloud::CloudPlugin;
use crate::models::{AuthField, CloudPluginMeta, MountConfig, SelectOption};

pub struct S3Plugin;

impl CloudPlugin for S3Plugin {
    fn meta(&self) -> CloudPluginMeta {
        CloudPluginMeta {
            id: "s3".to_string(),
            name: "S3 Compatible".to_string(),
            icon: "🪣".to_string(),
            auth_type: "credentials".to_string(),
            auth_fields: vec![
                AuthField {
                    id: "provider".to_string(),
                    label: "Provider".to_string(),
                    field_type: "select".to_string(),
                    required: true,
                    placeholder: None,
                    options: Some(vec![
                        SelectOption {
                            value: "AWS".to_string(),
                            label: "Amazon S3".to_string(),
                        },
                        SelectOption {
                            value: "Minio".to_string(),
                            label: "MinIO / custom endpoint".to_string(),
                        },
                        SelectOption {
                            value: "Wasabi".to_string(),
                            label: "Wasabi".to_string(),
                        },
                        SelectOption {
                            value: "Other".to_string(),
                            label: "Other S3-compatible".to_string(),
                        },
                    ]),
                },
                AuthField {
                    id: "access_key_id".to_string(),
                    label: "Access key ID".to_string(),
                    field_type: "text".to_string(),
                    required: true,
                    placeholder: None,
                    options: None,
                },
                AuthField {
                    id: "secret_access_key".to_string(),
                    label: "Secret access key".to_string(),
                    field_type: "password".to_string(),
                    required: true,
                    placeholder: None,
                    options: None,
                },
                AuthField {
                    id: "endpoint".to_string(),
                    label: "Endpoint URL".to_string(),
                    field_type: "text".to_string(),
                    required: false,
                    placeholder: Some("https://s3.example.com".to_string()),
                    options: None,
                },
                AuthField {
                    id: "bucket".to_string(),
                    label: "Bucket".to_string(),
                    field_type: "text".to_string(),
                    required: false,
                    placeholder: Some("optional default bucket".to_string()),
                    options: None,
                },
            ],
            capabilities: vec![
                "list".to_string(),
                "download".to_string(),
                "upload".to_string(),
                "create_folder".to_string(),
                "delete".to_string(),
                "rename".to_string(),
                "mount".to_string(),
            ],
            description: "Browse, transfer, and mount S3-compatible storage through rclone."
                .to_string(),
        }
    }

    fn remote_url(&self, config: &MountConfig) -> String {
        format!("s3://{}", config.url.as_deref().unwrap_or("bucket"))
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
        Err("S3 mount restore is registered but not yet implemented.".to_string())
    }
}
