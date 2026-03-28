#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;

#[tauri::command]
fn desktop_bridge(command: String, payload: Option<String>) -> Result<String, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir
        .join("..")
        .join("..")
        .join("..")
        .canonicalize()
        .map_err(|error| format!("Failed to resolve repo root: {error}"))?;
    let src_dir = repo_root.join("src");
    let bridge_script = std::env::var("GPA_MANAGER_BRIDGE_SCRIPT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| repo_root.join("tools").join("desktop_backend_bridge.py"));
    let python_binary = std::env::var("GPA_MANAGER_PYTHON").unwrap_or_else(|_| "python".to_string());

    let mut process = Command::new(python_binary);
    process
        .arg(bridge_script)
        .arg("--command")
        .arg(command)
        .current_dir(&repo_root)
        .env("PYTHONPATH", src_dir)
        .env("PYTHONIOENCODING", "utf-8");

    if let Ok(db_path) = std::env::var("GPA_MANAGER_DB_PATH") {
        process.arg("--db").arg(db_path);
    }

    if let Some(payload) = payload {
        process.arg("--payload").arg(payload);
    }

    let output = process
        .output()
        .map_err(|error| format!("Failed to run Python bridge: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        if !stdout.is_empty() {
            return Ok(stdout);
        }

        return Err(if stderr.is_empty() {
            "Python bridge exited with a non-zero status.".to_string()
        } else {
            stderr
        });
    }

    if stdout.is_empty() {
        return Err("Python bridge returned no output.".to_string());
    }

    Ok(stdout)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![desktop_bridge])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
