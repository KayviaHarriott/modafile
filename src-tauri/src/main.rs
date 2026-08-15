#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{path::PathBuf, process::Command, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use tauri::{LogicalSize, Manager, PhysicalPosition, Size};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_dialog::DialogExt;

struct AppState {
    navbar_mode: Mutex<bool>,
    tray: Mutex<Option<TrayIcon>>,
}

#[tauri::command]
async fn choose_output_folder(app: tauri::AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().blocking_pick_folder()
            .and_then(|folder| folder.into_path().ok())
            .map(|path| path.to_string_lossy().into_owned())
    }).await.ok().flatten()
}

#[tauri::command]
fn save_pdf(folder: String, filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let path = PathBuf::from(folder).join(filename);
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read(path)
        .map(|bytes| BASE64.encode(bytes))
        .map_err(|error| error.to_string())
}

fn next_compressed_path(input: &PathBuf, folder: &PathBuf) -> PathBuf {
    let stem = input.file_stem().and_then(|name| name.to_str()).unwrap_or("document");
    let first = folder.join(format!("{}-compressed.pdf", stem));
    if !first.exists() { return first; }
    let mut index = 1;
    loop {
        let candidate = folder.join(format!("{}-compressed-{}.pdf", stem, index));
        if !candidate.exists() { return candidate; }
        index += 1;
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompressionResult {
    path: String,
    target_met: bool,
}

fn ghostscript_path() -> Result<&'static str, String> {
    ["/opt/homebrew/bin/gs", "/usr/local/bin/gs", "gs"]
        .into_iter()
        .find(|path| *path == "gs" || PathBuf::from(path).exists())
        .ok_or("PDF compression requires Ghostscript. Install it with `brew install ghostscript`, then reopen KiloFile.".into())
}

fn run_ghostscript(input: &PathBuf, output: &PathBuf, dpi: u32) -> Result<(), String> {
    let ghostscript = ghostscript_path()?;
    let dpi = dpi.to_string();
    let result = Command::new(ghostscript)
        .args([
            "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6", "-dNOPAUSE", "-dBATCH", "-dQUIET",
            "-dDetectDuplicateImages=true", "-dCompressFonts=true", "-dPreserveAnnots=true",
            "-dDownsampleColorImages=true", "-dColorImageDownsampleType=/Bicubic",
            "-dDownsampleGrayImages=true", "-dGrayImageDownsampleType=/Bicubic",
            "-dDownsampleMonoImages=true", "-dMonoImageDownsampleType=/Subsample",
        ])
        .arg(format!("-dColorImageResolution={dpi}"))
        .arg(format!("-dGrayImageResolution={dpi}"))
        .arg(format!("-dMonoImageResolution={dpi}"))
        .arg(format!("-sOutputFile={}", output.to_string_lossy()))
        .arg(input)
        .output()
        .map_err(|error| error.to_string())?;
    if !result.status.success() {
        return Err(String::from_utf8_lossy(&result.stderr).trim().to_string());
    }
    Ok(())
}

#[tauri::command]
fn compress_pdf(input_path: String, folder: String, target_mb: Option<f64>) -> Result<CompressionResult, String> {
    let input = PathBuf::from(input_path);
    let output_folder = PathBuf::from(folder);
    let output = next_compressed_path(&input, &output_folder);
    let limit = target_mb.filter(|value| *value > 0.0).map(|value| (value * 1024.0 * 1024.0) as u64);
    let resolutions: &[u32] = if limit.is_some() { &[170, 140, 110, 90, 72, 60, 48] } else { &[72, 60, 48] };
    let temporary = output_folder.join(format!(".{}.kilofile-working.pdf", input.file_stem().and_then(|name| name.to_str()).unwrap_or("document")));
    let mut chosen = None;
    for dpi in resolutions {
        let _ = std::fs::remove_file(&temporary);
        run_ghostscript(&input, &temporary, *dpi)?;
        let size = std::fs::metadata(&temporary).map_err(|error| error.to_string())?.len();
        chosen = Some(size);
        if limit.is_none_or(|maximum| size <= maximum) { break; }
    }
    std::fs::rename(&temporary, &output).map_err(|error| error.to_string())?;
    Ok(CompressionResult {
        path: output.to_string_lossy().into_owned(),
        target_met: limit.is_none_or(|maximum| chosen.unwrap_or(u64::MAX) <= maximum),
    })
}

fn convert_with_sips(input: PathBuf, folder: PathBuf, format: String) -> Result<String, String> {
    let format = format.to_lowercase();
    let (sips_format, extension) = match format.as_str() {
        "png" => ("png", "png"),
        "jpg" | "jpeg" => ("jpeg", "jpg"),
        "heic" | "heif" => ("heic", "heic"),
        _ => return Err("This format is not supported yet. Image conversion currently supports PNG, JPG, and HEIC.".into()),
    };
    let name = input.file_stem().and_then(|name| name.to_str()).unwrap_or("converted");
    let output = folder.join(format!("{}-converted.{}", name, extension));
    let result = Command::new("/usr/bin/sips")
        .args(["-s", "format", sips_format])
        .arg(&input)
        .arg("--out")
        .arg(&output)
        .output()
        .map_err(|error| error.to_string())?;
    if !result.status.success() { return Err(String::from_utf8_lossy(&result.stderr).into_owned()); }
    Ok(output.to_string_lossy().into_owned())
}

#[tauri::command]
fn convert_file(input_path: String, folder: String, format: String) -> Result<String, String> {
    convert_with_sips(PathBuf::from(input_path), PathBuf::from(folder), format)
}

#[tauri::command]
fn convert_uploaded_file(filename: String, bytes: Vec<u8>, folder: String, format: String) -> Result<String, String> {
    let unique = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_nanos();
    let source = std::env::temp_dir().join(format!("pdf-squeeze-{}-{}", unique, filename));
    std::fs::write(&source, bytes).map_err(|error| error.to_string())?;
    let result = convert_with_sips(source.clone(), PathBuf::from(folder), format);
    let _ = std::fs::remove_file(source);
    result
}

#[tauri::command]
fn resize_pill(app: tauri::AppHandle, expanded: bool) -> Result<(), String> {
    resize_window(app, if expanded { 284.0 } else { 128.0 })
}

#[tauri::command]
fn resize_window(app: tauri::AppHandle, width: f64) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    window.set_size(Size::Logical(LogicalSize::new(width, 520.0))).map_err(|error| error.to_string())?;
    window.set_position(PhysicalPosition::new(position.x, position.y)).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn default_output_folder() -> String {
    std::env::var_os("HOME").map(PathBuf::from).map(|home| home.join("Downloads")).unwrap_or_else(|| PathBuf::from("Downloads")).to_string_lossy().into_owned()
}

#[tauri::command]
fn start_window_dragging(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("Main window not found")?
        .start_dragging()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_always_on_top(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("Main window not found")?
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())
}

fn show_navbar_window(app: &tauri::AppHandle, anchor_x: f64, anchor_y: f64) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    if let Some(monitor) = window.current_monitor().map_err(|error| error.to_string())? {
        let work_area = monitor.work_area();
        let size = window.outer_size().map_err(|error| error.to_string())?;
        let min_x = work_area.position.x + 8;
        let max_x = work_area.position.x + work_area.size.width as i32 - size.width as i32 - 8;
        let x = ((anchor_x as i32) - (size.width as i32 / 2)).clamp(min_x, max_x);
        let y = (anchor_y as i32 + 8).max(work_area.position.y + 8);
        window.set_position(PhysicalPosition::new(x, y)).map_err(|error| error.to_string())?;
    }
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_navbar_mode(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    *state.navbar_mode.lock().map_err(|_| "Navbar mode state is unavailable")? = enabled;
    if let Some(tray) = state.tray.lock().map_err(|_| "Tray state is unavailable")?.as_ref() {
        tray.set_visible(enabled).map_err(|error| error.to_string())?;
    }
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    if enabled { window.hide().map_err(|error| error.to_string())?; } else { window.show().map_err(|error| error.to_string())?; }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState { navbar_mode: Mutex::new(false), tray: Mutex::new(None) })
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let tray = TrayIconBuilder::with_id("pdf-squeeze-navbar")
                .icon(app.default_window_icon().expect("missing app icon").clone())
                .icon_as_template(true)
                .tooltip("KiloFile")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, position, .. } = event {
                        let app = tray.app_handle();
                        if app.state::<AppState>().navbar_mode.lock().map(|mode| *mode).unwrap_or(false) {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) { let _ = window.hide(); } else { let _ = show_navbar_window(app, position.x, position.y); }
                            }
                        }
                    }
                })
                .build(app)?;
            tray.set_visible(false)?;
            *app.state::<AppState>().tray.lock().map_err(|_| "Tray state is unavailable")? = Some(tray);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![choose_output_folder, save_pdf, read_file, compress_pdf, convert_file, convert_uploaded_file, resize_pill, resize_window, default_output_folder, start_window_dragging, set_always_on_top, set_navbar_mode])
        .run(tauri::generate_context!())
        .expect("error while running KiloFile")
}
