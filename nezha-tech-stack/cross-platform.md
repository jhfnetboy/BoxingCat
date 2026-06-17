# 跨平台策略

## 概述

Nezha 支持 **macOS**、**Windows** 和 **Linux** 三大平台。本文档总结跨平台开发中的关键差异处理和经验。

## 一、macOS 窗口管理

### Dock 隐藏而非退出

macOS 应用的标准行为是点关闭按钮后隐藏到 Dock 而非退出。Nezha 通过 `on_window_event` 实现：

```rust
.on_window_event(|window, event| {
    #[cfg(target_os = "macos")]
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        hide_window_to_dock(window.clone());
        api.prevent_close();  // 阻止默认的退出行为
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (window, event);
})
```

其他平台（Windows/Linux）没有 Dock 唤回入口，保持默认退出行为。

### 全屏窗口的特殊处理

macOS 原生全屏窗口独占一个 Space，直接 `hide()` 会留下黑屏空 Space。必须先退出全屏：

```rust
#[cfg(target_os = "macos")]
fn hide_window_to_dock(window: tauri::Window) {
    if !window.is_fullscreen().unwrap_or(false) {
        let _ = window.hide();
        return;
    }

    let _ = window.set_fullscreen(false);

    // 轮询等退出全屏完成（~5s 兜底）
    std::thread::spawn(move || {
        let mut exited = false;
        for _ in 0..100 {
            std::thread::sleep(Duration::from_millis(50));
            if !window.is_fullscreen().unwrap_or(false) {
                exited = true;
                break;
            }
        }
        if !exited { return; }  // 退出失败时不 hide

        // 退出后仍可能短暂忽略 hide，间隔多次覆盖
        for _ in 0..8 {
            std::thread::sleep(Duration::from_millis(120));
            let _ = window.hide();
        }
    });
}
```

### Dock 图标唤回

窗口被隐藏后，点击 Dock 图标触发 `Reopen` 事件：

```rust
.run(|_app_handle, _event| {
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Reopen { .. } = _event {
        if let Some(window) = _app_handle.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
});
```

### Cmd+W 快捷键

前端 `Cmd+W` 通过 Tauri 命令 `hide_main_window` 收起窗口：

```rust
#[tauri::command]
fn hide_main_window(window: tauri::Window) {
    #[cfg(target_os = "macos")]
    hide_window_to_dock(window);
    #[cfg(not(target_os = "macos"))]
    let _ = window;  // 其他平台不触发
}
```

## 二、Windows 特殊处理

### 隐藏控制台窗口

Windows 上启动后台子进程（git、agent）时，必须设置 `CREATE_NO_WINDOW` 防止弹出控制台窗口：

```rust
// std::process::Command
#[cfg(windows)]
pub(crate) fn configure_background_command(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

// tokio::process::Command
#[cfg(windows)]
pub(crate) fn configure_background_tokio_command(cmd: &mut tokio::process::Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn configure_background_command(_cmd: &mut std::process::Command) {}
```

### Tauri 二进制属性

```rust
// main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

此属性在 release 模式下隐藏 Windows 控制台窗口。

### 路径处理

Windows 上 `fs::canonicalize` 会产生带 `\\?\` 前缀的 verbatim 路径，该前缀 `cmd.exe` 不识别。因此 `detect_node()` 在 Windows 上跳过 canonicalize：

```rust
pub fn detect_node() -> Option<String> {
    let raw = crate::platform::detect_path("node");
    if raw.is_empty() { return None; }

    #[cfg(unix)]
    {
        // Unix: 解析 symlink（nvm/asdf shim）
        if let Ok(real) = fs::canonicalize(&raw) {
            return Some(real.to_string_lossy().into_owned());
        }
    }
    Some(raw)  // Windows: 直接用 detect_path 返回的普通路径
}
```

### Codex app-server RPC（暂不可用）

```rust
#[tauri::command]
pub async fn read_usage_snapshot(...) -> Result<UsageSnapshot, String> {
    if cfg!(windows) {
        return Ok(UsageSnapshot {
            claude: unavailable("Usage insights are temporarily disabled on Windows."),
            codex: unavailable("Usage insights are temporarily disabled on Windows."),
            fetched_at: chrono::Utc::now().timestamp(),
        });
    }
    // ...
}
```

## 三、Linux 特殊处理

### 系统依赖

Tauri 2 在 Linux 上需要 WebKit2GTK：

```yaml
# CI 中安装
- name: Install Linux system dependencies
  if: runner.os == 'Linux'
  run: |
    sudo apt-get install -y \
      libwebkit2gtk-4.1-dev \
      libgtk-3-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev \
      libsoup-3.0-dev \
      libjavascriptcoregtk-4.1-dev
```

### 打包格式

Linux 构建产物为 `.deb`（Debian/Ubuntu）和 `.rpm`（Fedora/RHEL）。

## 四、环境变量跨平台处理

### Locale 设置

从 Dock 启动的 Tauri 应用进程环境中没有 locale 变量，导致 PTY 子进程无法正确处理中文等多字节输入：

```rust
fn setup_env(cmd: &mut CommandBuilder) {
    let login_env = crate::app_settings::get_login_shell_env();
    for (key, value) in login_env {
        cmd.env(key, value);
    }

    // 兜底：确保 locale 为 UTF-8
    let has = |name: &str| login_env.iter().any(|(k, _)| k == name);
    if !has("LANG") {
        cmd.env("LANG", "en_US.UTF-8");
    }
    if !has("LC_CTYPE") {
        cmd.env("LC_CTYPE", "en_US.UTF-8");
    }

    // 终端类型：确保 CLI 输出正确的转义序列
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
}
```

### 登录 Shell 环境导入

```rust
pub fn get_login_shell_env() -> Vec<(String, String)> {
    // macOS/Linux: 通过 login shell 获取完整环境变量
    // 确保 PTY 子进程继承用户的 PATH、HOME 等
}
```

### Hook 命令的跨 Shell 兼容

```rust
// 裸 `node` 命令 + 双引号路径，所有 shell 都正确解析：
// cmd.exe:  token 1 = "node", token 2 = "\"C:\\path\\hook.mjs\""
// PowerShell: 同上
// sh/bash:  同上
fn hook_command(script: &str) -> String {
    format!("node \"{}\"", script)
}
```

## 五、xterm.js 平台差异

### macOS

```rust
// Claude Code v2.1.150+ 默认开 xterm 鼠标上报（mode 1002），
// 在 macOS 上会吞掉 xterm.js 的原生拖动框选
#[cfg(target_os = "macos")]
cmd.env("CLAUDE_CODE_DISABLE_MOUSE", "1");

// Windows 上加这个反而让滚轮失效，所以只对 macOS 启用
```

### 输入法修复

- **macOS WebKit**：`attachMacWebKitShiftInputFix` 处理 Shift 键中文输入问题
- **Linux IME**：`attachLinuxIMEFix` 处理 Linux 输入法组合事件

## 六、平台检测

### Rust 侧

```rust
// src-tauri/src/platform/mod.rs + unix.rs + windows.rs
pub(crate) fn default_shell_command() -> ShellCommand {
    #[cfg(target_os = "windows")]
    { ShellCommand { program: "cmd.exe".into(), args: vec![] } }
    #[cfg(not(target_os = "windows"))]
    { ShellCommand { program: "/bin/sh".into(), args: vec!["-l".into()] } }
}

pub(crate) fn home_dir() -> Option<PathBuf> {
    // 跨平台获取 HOME 目录
}
```

### 前端侧

```typescript
// src/platform.ts
export function detectAppPlatform(): "windows" | "macos" | "other" {
  // 基于 navigator.userAgent 检测
  // 用于键盘快捷键标签差异化（Ctrl vs ⌘）
}
```

## 七、跨平台经验总结

| 场景 | 问题 | 解决方案 |
|------|------|----------|
| macOS 关闭窗口 | 默认行为是退出 | `api.prevent_close()` + hide |
| macOS 全屏 hide | 留下黑屏 Space | 先退出全屏、轮询确认、再 hide |
| Windows 子进程 | 弹出控制台窗口 | `CREATE_NO_WINDOW` |
| Windows 路径 | `\\?\` prefix cmd 不识别 | 跳过 canonicalize |
| macOS Dock 启动 | 无 locale 环境变量 | login shell 导入 + 兜底 UTF-8 |
| 跨 Shell hook 命令 | PowerShell 解析差异 | 裸 `node` + 双引号，不用全路径 |
| xterm 鼠标 | macOS 上框选被吞 | `CLAUDE_CODE_DISABLE_MOUSE=1`（仅 macOS） |
| 中文输入 | WebKit bug | `attachMacWebKitShiftInputFix` |
| Linux 系统依赖 | WebKit2GTK | CI 显式安装 |
