use crate::utils::validate_existing_path_no_resolve;

use std::process::Command;

fn validate_terminal_directory(path: &str) -> Result<std::path::PathBuf, String> {
    let path = validate_existing_path_no_resolve(path)?;
    if !path.is_dir() {
        return Err("Terminal can only be opened for directories".to_string());
    }
    Ok(path)
}

#[tauri::command]
pub async fn open_terminal(path: String) -> Result<(), String> {
    let validated_path = validate_terminal_directory(&path)?;

    #[cfg(target_os = "linux")]
    {
        let path_arg = validated_path.to_string_lossy().to_string();
        let terminals: Vec<(&str, Vec<&str>)> = vec![
            ("gnome-terminal", vec!["--working-directory", &path_arg]),
            ("konsole", vec!["--workdir", &path_arg]),
            ("xfce4-terminal", vec!["--working-directory", &path_arg]),
            (
                "xterm",
                vec![
                    "-e",
                    "sh",
                    "-lc",
                    "cd -- \"$1\" && exec \"${SHELL:-sh}\"",
                    "sh",
                    &path_arg,
                ],
            ),
            (
                "x-terminal-emulator",
                vec!["--working-directory", &path_arg],
            ),
        ];

        for (program, args) in terminals {
            let mut command = Command::new(program);
            command.args(args);
            if command.spawn().is_ok() {
                return Ok(());
            }
        }
        Err("Failed to open terminal: no supported terminal emulator was found".to_string())
    }
}

#[tauri::command]
pub async fn open_powershell_admin(_path: String) -> Result<(), String> {
    Err("PowerShell as Administrator is only available on Windows".to_string())
}
