/// BoxingCat — AI-powered desktop boxing companion cat.
///
/// Phase 0: Basic Tauri 2 shell with transparent window + React frontend.
/// Cat renders as CSS emoji; backend provides a simple greet command.

// ── Tauri Command ────────────────────────────────────────────────────────────

#[tauri::command]
fn greet(name: &str) -> String {
    format!("🥊 {} says: Let's box! Meow!", name)
}

// ── macOS Window Management ─────────────────────────────────────────────────
// 关闭按钮隐藏到 Dock(而非退出),Cmd+W 同理。
// 参考 Nezha 项目的 hide_window_to_dock 实现。

#[cfg(target_os = "macos")]
fn hide_window_to_dock(window: tauri::Window) {
    use std::time::Duration;
    if !window.is_fullscreen().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    let _ = window.set_fullscreen(false);
    std::thread::spawn(move || {
        let mut exited = false;
        for _ in 0..100 {
            std::thread::sleep(Duration::from_millis(50));
            if !window.is_fullscreen().unwrap_or(false) {
                exited = true;
                break;
            }
        }
        if !exited {
            return;
        }
        for _ in 0..8 {
            std::thread::sleep(Duration::from_millis(120));
            let _ = window.hide();
        }
    });
}

#[tauri::command]
fn hide_main_window(window: tauri::Window) {
    #[cfg(target_os = "macos")]
    hide_window_to_dock(window);
    #[cfg(not(target_os = "macos"))]
    let _ = window;
}

#[tauri::command]
fn open_training_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    // Close existing training window if any
    if let Some(w) = app.get_webview_window("training") {
        let _ = w.close();
    }
    WebviewWindowBuilder::new(
        &app,
        "training",
        tauri::WebviewUrl::App("/".into()),
    )
    .title("🥊 Boxing Training")
    .inner_size(900.0, 680.0)
    .min_inner_size(700.0, 500.0)
    .resizable(true)
    .center()
    .visible(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn close_training_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("training") {
        let _ = w.close();
    }
    Ok(())
}

// ── App Entry ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            hide_main_window,
            open_training_window,
            close_training_window,
        ])
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                hide_window_to_dock(window.clone());
                api.prevent_close();
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, _event| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let tauri::RunEvent::Reopen { .. } = _event {
                    if let Some(window) = _app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
}
