use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use url::Url;
use zbus::interface;

pub struct FileManager1 {
    app_handle: AppHandle,
}

impl FileManager1 {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    fn handle_uris(&self, uris: Vec<String>) {
        for uri_str in uris {
            if let Ok(url) = Url::parse(&uri_str) {
                if url.scheme() == "file" {
                    if let Ok(path) = url.to_file_path() {
                        let _ = self
                            .app_handle
                            .emit("open-path", path.to_string_lossy().to_string());
                    }
                }
            } else if let Ok(path) = PathBuf::from(&uri_str).canonicalize() {
                // Also accept raw paths just in case
                let _ = self
                    .app_handle
                    .emit("open-path", path.to_string_lossy().to_string());
            }
        }

        // Show the window
        if let Some(window) = self.app_handle.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[interface(name = "org.freedesktop.FileManager1")]
impl FileManager1 {
    async fn show_folders(&self, uris: Vec<String>, _startup_id: String) {
        self.handle_uris(uris);
    }

    async fn show_items(&self, uris: Vec<String>, _startup_id: String) {
        self.handle_uris(uris);
    }

    async fn show_item_properties(&self, uris: Vec<String>, _startup_id: String) {
        self.handle_uris(uris);
    }
}

pub async fn start_dbus_server(app_handle: AppHandle) -> zbus::Result<()> {
    let file_manager = FileManager1::new(app_handle);
    let _conn = zbus::connection::Builder::session()?
        .name("org.freedesktop.FileManager1")?
        .serve_at("/org/freedesktop/FileManager1", file_manager)?
        .build()
        .await?;

    // Keep the connection alive indefinitely
    std::future::pending::<()>().await;

    Ok(())
}
