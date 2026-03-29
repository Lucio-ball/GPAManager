#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;

fn resolve_python_binary() -> String {
    if let Ok(explicit) = std::env::var("GPA_MANAGER_PYTHON") {
        return explicit;
    }

    for candidate in ["python3", "python"] {
        let available = Command::new(candidate)
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false);
        if available {
            return candidate.to_string();
        }
    }

    "python3".to_string()
}

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
    let python_binary = resolve_python_binary();
    let python_path = std::env::var("PYTHONPATH")
        .map(|value| format!("{}:{}", src_dir.display(), value))
        .unwrap_or_else(|_| src_dir.display().to_string());

    let mut process = Command::new(python_binary);
    process
        .arg(bridge_script)
        .arg("--command")
        .arg(command)
        .current_dir(&repo_root)
        .env("PYTHONPATH", python_path)
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
