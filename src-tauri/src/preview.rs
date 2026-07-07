use crate::models::{FilePreview, ThumbnailResult};

use crate::utils::validate_existing_path_no_resolve;
use std::fs;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use std::path::PathBuf;

fn hex_encode(bytes: impl AsRef<[u8]>) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let bytes = bytes.as_ref();
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn get_thumbnail_cache_dir() -> Option<PathBuf> {
    directories::BaseDirs::new().map(|dirs| dirs.cache_dir().join("thumbnails").join("normal"))
}

#[tauri::command]
pub async fn open_external_url(url: String, app: AppHandle) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => app
            .opener()
            .open_url(url, None::<&str>)
            .map_err(|e| format!("Failed to open browser: {e}")),
        scheme => Err(format!("Unsupported URL scheme: {scheme}")),
    }
}

#[tauri::command]
pub fn read_file_preview(path: String, max_size: Option<u64>) -> Result<FilePreview, String> {
    if false {
        return Ok(FilePreview {
            file_type: "unsupported".to_string(),
            content: None,
            mime_type: "Cloud drive previews are disabled to keep mounted drives responsive."
                .to_string(),
            size: 0,
            encoding: None,
        });
    }

    let path_buf = resolve_readable_path(&path)?;
    if path_buf.is_dir() {
        return Err("Cannot preview a directory".to_string());
    }

    let metadata = fs::metadata(&path_buf).map_err(|e| format!("Failed to get metadata: {e}"))?;
    let size = metadata.len();
    // Cap at 10 MB to prevent memory exhaustion from a malicious/buggy frontend
    const MAX_ALLOWED: u64 = 10 * 1024 * 1024;
    let max_preview_size = max_size.unwrap_or(1024 * 1024).min(MAX_ALLOWED);
    let extension = path_buf
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let (file_type, mime_type) = match extension.as_str() {
        "txt" | "md" | "json" | "xml" | "yaml" | "yml" | "toml" | "ini" | "cfg" | "conf"
        | "log" | "csv" | "tsv" => ("text", format!("text/{extension}")),
        "rs" | "js" | "ts" | "jsx" | "tsx" | "py" | "rb" | "go" | "java" | "c" | "cpp" | "h"
        | "hpp" | "cs" | "php" | "swift" | "kt" | "scala" | "sh" | "bash" | "zsh" | "ps1"
        | "bat" | "cmd" | "sql" | "r" | "lua" | "pl" | "pm" => {
            ("text", format!("text/x-{extension}"))
        }
        "html" | "htm" => ("text", "text/html".to_string()),
        "css" => ("text", "text/css".to_string()),
        "scss" | "sass" | "less" => ("text", format!("text/x-{extension}")),
        "png" => ("image", "image/png".to_string()),
        "jpg" | "jpeg" => ("image", "image/jpeg".to_string()),
        "gif" => ("image", "image/gif".to_string()),
        "webp" => ("image", "image/webp".to_string()),
        "svg" => ("image", "image/svg+xml".to_string()),
        "bmp" => ("image", "image/bmp".to_string()),
        "ico" => ("image", "image/x-icon".to_string()),
        "pdf" => ("pdf", "application/pdf".to_string()),
        "mp4" | "webm" | "ogg" | "mov" | "avi" | "mkv" => ("video", format!("video/{extension}")),
        "mp3" | "wav" | "flac" | "aac" | "m4a" => ("audio", format!("audio/{extension}")),
        "zip" | "tar" | "gz" | "7z" | "rar" | "exe" | "dll" | "so" | "dylib" => {
            ("unsupported", "application/octet-stream".to_string())
        }
        _ => {
            if size <= max_preview_size {
                // Only read the first 8KB to detect binary content instead of the entire file
                let detect_size = std::cmp::min(size, 8192) as usize;
                if let Ok(mut file) = fs::File::open(&path_buf) {
                    use std::io::Read;
                    let mut buffer = vec![0u8; detect_size];
                    if let Ok(bytes_read) = file.read(&mut buffer) {
                        buffer.truncate(bytes_read);
                        if buffer
                            .iter()
                            .all(|&b| b != 0 && (b >= 32 || b == 9 || b == 10 || b == 13))
                        {
                            ("text", "text/plain".to_string())
                        } else {
                            ("binary", "application/octet-stream".to_string())
                        }
                    } else {
                        ("unsupported", "application/octet-stream".to_string())
                    }
                } else {
                    ("unsupported", "application/octet-stream".to_string())
                }
            } else {
                ("unsupported", "application/octet-stream".to_string())
            }
        }
    };

    let (content, encoding) = match file_type {
        "text" => {
            if size > max_preview_size {
                let mut file =
                    fs::File::open(&path_buf).map_err(|e| format!("Failed to open file: {e}"))?;
                let mut buffer = vec![0u8; max_preview_size as usize];
                use std::io::Read;
                let bytes_read = file
                    .read(&mut buffer)
                    .map_err(|e| format!("Failed to read file: {e}"))?;
                buffer.truncate(bytes_read);
                let text = String::from_utf8_lossy(&buffer).to_string();
                (
                    Some(text + "\n\n[File truncated...]"),
                    Some("utf-8".to_string()),
                )
            } else {
                let text = fs::read_to_string(&path_buf)
                    .map_err(|e| format!("Failed to read file: {e}"))?;
                (Some(text), Some("utf-8".to_string()))
            }
        }
        "image" => {
            if size > max_preview_size * 5 {
                (None, None)
            } else {
                let bytes = fs::read(&path_buf).map_err(|e| format!("Failed to read file: {e}"))?;
                use base64::{engine::general_purpose, Engine as _};
                let base64 = general_purpose::STANDARD.encode(&bytes);
                (Some(base64), Some("base64".to_string()))
            }
        }
        "pdf" => {
            // Cap PDF previews at 20 MB — large enough for most documents
            const PDF_MAX: u64 = 20 * 1024 * 1024;
            if size > PDF_MAX {
                (None, None)
            } else {
                let bytes = fs::read(&path_buf).map_err(|e| format!("Failed to read file: {e}"))?;
                use base64::{engine::general_purpose, Engine as _};
                let base64 = general_purpose::STANDARD.encode(&bytes);
                (Some(base64), Some("base64".to_string()))
            }
        }
        _ => (None, None),
    };

    Ok(FilePreview {
        file_type: file_type.to_string(),
        content,
        mime_type,
        size,
        encoding,
    })
}

#[tauri::command]
pub fn generate_thumbnail(path: String, size: Option<u32>) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    if false {
        return Err("Thumbnails are disabled for mounted cloud drives.".to_string());
    }

    let path_buf = resolve_readable_path(&path)?;
    let extension = path_buf
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let supported = matches!(
        extension.as_str(),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp"
    );
    if !supported {
        return Err(format!("Unsupported image format: {extension}"));
    }

    let thumb_size = size.unwrap_or(128);

    // Attempt Freedesktop Thumbnail Cache
    let uri = reqwest::Url::from_file_path(&path_buf)
        .map_err(|_| "Failed to create file URI".to_string())?
        .to_string();
    
    use md5::Md5;
    use sha2::Digest;
    let mut hasher = Md5::new();
    hasher.update(uri.as_bytes());
    let md5_hash = hex_encode(hasher.finalize());
    
    let cache_dir = get_thumbnail_cache_dir();
    let cache_path = cache_dir.as_ref().map(|dir| dir.join(format!("{md5_hash}.png")));
    
    let original_mtime = fs::metadata(&path_buf).and_then(|m| m.modified()).ok();

    if let Some(ref cp) = cache_path {
        if cp.exists() {
            let cache_mtime = fs::metadata(cp).and_then(|m| m.modified()).ok();
            if let (Some(orig_m), Some(cache_m)) = (original_mtime, cache_mtime) {
                if cache_m >= orig_m {
                    if let Ok(bytes) = fs::read(cp) {
                        return Ok(general_purpose::STANDARD.encode(bytes));
                    }
                }
            }
        }
    }

    let img = image::open(&path_buf).map_err(|e| format!("Failed to open image: {e}"))?;
    // Let the image library handle aspect-ratio-preserving resize
    let thumbnail = img.thumbnail(thumb_size, thumb_size);
    
    // Encode with png crate to add Freedesktop tEXt chunks
    let mut buffer = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut buffer, thumbnail.width(), thumbnail.height());
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        
        let meta = fs::metadata(&path_buf).ok();
        let mtime = meta.as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_default();
            
        let size_str = meta.as_ref()
            .map(|m| m.len().to_string())
            .unwrap_or_default();

        let mime = match extension.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            _ => "application/octet-stream",
        };
        
        let _ = encoder.add_text_chunk("Thumb::URI".to_string(), uri);
        let _ = encoder.add_text_chunk("Thumb::MTime".to_string(), mtime);
        let _ = encoder.add_text_chunk("Thumb::Size".to_string(), size_str);
        let _ = encoder.add_text_chunk("Thumb::Mimetype".to_string(), mime.to_string());
        
        let mut writer = encoder.write_header().map_err(|e| format!("Failed to write PNG header: {e}"))?;
        let rgba = thumbnail.into_rgba8();
        writer.write_image_data(&rgba).map_err(|e| format!("Failed to write PNG data: {e}"))?;
    }
    
    let image_bytes = buffer;
    
    // Save to cache
    if let Some(ref cp) = cache_path {
        if let Some(dir) = cache_dir {
            let _ = fs::create_dir_all(&dir);
            let _ = fs::write(cp, &image_bytes);
        }
    }

    let base64_thumb = general_purpose::STANDARD.encode(image_bytes);
    Ok(base64_thumb)
}

#[tauri::command]
pub fn generate_thumbnails(paths: Vec<String>, size: Option<u32>) -> Vec<ThumbnailResult> {
    paths
        .into_iter()
        .map(|path| match generate_thumbnail(path.clone(), size) {
            Ok(data) => ThumbnailResult {
                path,
                data: Some(data),
                error: None,
            },
            Err(e) => ThumbnailResult {
                path,
                data: None,
                error: Some(e),
            },
        })
        .collect()
}

#[tauri::command]
pub async fn open_file(path: String, app: AppHandle) -> Result<(), String> {
    let open_path = if crate::archive::is_archive_virtual_path(&path) {
        crate::archive::materialize_archive_entry_to_temp(&path)?
            .to_string_lossy()
            .to_string()
    } else {
        path
    };

    if std::path::Path::new(&open_path).is_dir() {
        return Err("Cannot open a directory as a file".to_string());
    }

    app.opener()
        .open_path(&open_path, None::<&str>)
        .map_err(|e| format!("Failed to open file: {e}"))
}

fn resolve_readable_path(path: &str) -> Result<std::path::PathBuf, String> {
    if crate::archive::is_archive_virtual_path(path) {
        crate::archive::materialize_archive_entry_to_temp(path)
    } else {
        validate_existing_path_no_resolve(path)
    }
}

#[tauri::command]
pub async fn reveal_in_folder(path: String, app: AppHandle) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| format!("Failed to reveal in folder: {e}"))
}
