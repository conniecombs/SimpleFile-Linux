use tauri::{AppHandle, Emitter};
use zbus::{proxy, Connection};
use futures::stream::StreamExt;

#[proxy(
    interface = "org.freedesktop.DBus.ObjectManager",
    default_service = "org.freedesktop.UDisks2",
    default_path = "/org/freedesktop/UDisks2"
)]
trait ObjectManager {
    #[zbus(signal)]
    fn interfaces_added(
        &self,
        object_path: zbus::zvariant::ObjectPath<'_>,
        interfaces_and_properties: std::collections::HashMap<
            String,
            std::collections::HashMap<String, zbus::zvariant::OwnedValue>,
        >,
    ) -> zbus::Result<()>;

    #[zbus(signal)]
    fn interfaces_removed(
        &self,
        object_path: zbus::zvariant::ObjectPath<'_>,
        interfaces: Vec<String>,
    ) -> zbus::Result<()>;
}

pub fn spawn_dbus_monitor(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let conn = match Connection::system().await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to connect to system D-Bus: {}", e);
                return;
            }
        };

        let proxy = match ObjectManagerProxy::new(&conn).await {
            Ok(p) => p,
            Err(e) => {
                eprintln!("Failed to create UDisks2 proxy: {}", e);
                return;
            }
        };

        let mut added_stream = match proxy.receive_interfaces_added().await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to receive interfaces_added signal: {}", e);
                return;
            }
        };

        let mut removed_stream = match proxy.receive_interfaces_removed().await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to receive interfaces_removed signal: {}", e);
                return;
            }
        };

        loop {
            tokio::select! {
                Some(_) = added_stream.next() => {
                    let _ = app_handle.emit("drives-changed", ());
                }
                Some(_) = removed_stream.next() => {
                    let _ = app_handle.emit("drives-changed", ());
                }
            }
        }
    });
}
