// Hide the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;

/// Writes a file the user picked in the save dialog (designs and scripts).
#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| e.to_string())
}

/// Returns the token of an existing GitHub CLI login, if there is one.
#[tauri::command(async)]
fn gh_token() -> Result<String, String> {
    // Apps started from Finder don't inherit the shell PATH, so try common locations too.
    for gh in ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"] {
        let mut command = Command::new(gh);
        command.args(["auth", "token"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        if let Ok(output) = command.output() {
            let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if output.status.success() && !token.is_empty() {
                return Ok(token);
            }
        }
    }
    Err("GitHub CLI is not installed or not signed in".into())
}

// GitHub's device-flow endpoints don't allow browser (CORS) requests, so the
// app makes them from Rust and hands the JSON response back to the page.
fn post_form(url: &str, form: &[(&str, &str)]) -> Result<String, String> {
    ureq::post(url)
        .set("Accept", "application/json")
        .send_form(form)
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn device_start(client_id: String) -> Result<String, String> {
    post_form(
        "https://github.com/login/device/code",
        &[("client_id", client_id.as_str()), ("scope", "repo")],
    )
}

#[tauri::command(async)]
fn device_poll(client_id: String, device_code: String) -> Result<String, String> {
    post_form(
        "https://github.com/login/oauth/access_token",
        &[
            ("client_id", client_id.as_str()),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ],
    )
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_text, gh_token, device_start, device_poll])
        .run(tauri::generate_context!())
        .expect("error while running Commit Canvas");
}
