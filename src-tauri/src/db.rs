use rusqlite::Connection;
use std::error::Error;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager};

pub struct DbState {
    pub conn: Mutex<Option<Connection>>,
}

type DbInitResult<T> = std::result::Result<T, Box<dyn Error>>;

pub fn init_db(app: &AppHandle) -> DbInitResult<Connection> {
    let app_dir = app.path().app_data_dir()?;

    std::fs::create_dir_all(&app_dir)?;
    let db_path: PathBuf = app_dir.join("metadata.db");

    let conn = Connection::open(db_path)?;

    // Initialize schema
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS file_tags (
            file_path TEXT NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (file_path, tag_id),
            FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON", [])?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    // Seed default tags if empty
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))?;
    if count == 0 {
        let defaults = vec![
            ("Important", "#ff3b30"),
            ("Work", "#ff9500"),
            ("Personal", "#4cd964"),
            ("To Do", "#5ac8fa"),
            ("Later", "#007aff"),
        ];
        for (name, color) in defaults {
            conn.execute(
                "INSERT INTO tags (name, color) VALUES (?1, ?2)",
                [name, color],
            )?;
        }
    }

    Ok(conn)
}

pub fn lock_conn(db: &DbState) -> Result<MutexGuard<'_, Option<Connection>>, String> {
    db.conn
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())
}

#[tauri::command]
pub fn get_db_setting(
    db: tauri::State<'_, DbState>,
    key: String,
) -> Result<Option<String>, String> {
    let conn_guard = lock_conn(&db)?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query([key]).map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let value: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(Some(value))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn set_db_setting(
    db: tauri::State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn_guard = lock_conn(&db)?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{lock_conn, DbState};
    use std::sync::{Arc, Mutex};

    #[test]
    fn lock_conn_reports_poisoned_database_mutex() {
        let db = Arc::new(DbState {
            conn: Mutex::new(None),
        });
        let poisoned = Arc::clone(&db);

        let _ = std::thread::spawn(move || {
            let _guard = poisoned.conn.lock().expect("lock test database mutex");
            panic!("poison test database mutex");
        })
        .join();

        match lock_conn(&db) {
            Ok(_) => panic!("poisoned database lock should return an error"),
            Err(error) => assert_eq!(error, "Database lock poisoned"),
        };
    }
}
