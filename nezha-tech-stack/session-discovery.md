# 会话自动发现

## 概述

Nezha 需要将启动的 Agent 进程与其会话日志（JSONL）关联起来，以便用户查看历史会话消息和用量分析。这个过程称为**会话自动发现**。

## 一、会话存储位置

| Agent | 会话路径模式 | 示例 |
|-------|-------------|------|
| Claude Code | `~/.claude/projects/<encoded-path>/*.jsonl` | `~/.claude/projects/-Users-jason-Dev-myproject/abc123.jsonl` |
| Codex | `<project>/.codex/sessions/*.jsonl` | `/path/to/project/.codex/sessions/sess_xyz.jsonl` |

## 二、两种发现路径

Nezha 实现了**两代会话发现机制**，按优先级依次尝试：

### 路径 1：Hook 事件驱动（主路径，优先级最高）

当 Hook 链路可信时，Agent 进程在启动时通过 Hook 脚本直接上报 `SessionStart` 事件：

```
Agent 启动 → Hook 触发 SessionStart
  → nezha-hook.mjs 写入 events.jsonl
    → event_watcher.rs 解析 SessionStart
      → 注册到 TaskManager + emit "task-session"
```

```rust
fn handle_session_start(app: &AppHandle, ev: &HookEvent) {
    let tm = app.state::<TaskManager>();
    let session_path = ev.transcript_path.clone();

    // 注册到 TaskManager
    if ev.agent == "codex" {
        tm.codex_sessions.lock().insert(
            ev.task_id.clone(),
            CodexSessionInfo { session_id, session_path }
        );
    } else {
        tm.claude_sessions.lock().insert(
            ev.task_id.clone(),
            ClaudeSessionInfo { session_id, session_path, is_placeholder: false }
        );
    }

    // 通知前端
    let _ = app.emit("task-session", json!({
        "task_id": ev.task_id,
        "session_id": ev.session_id,
        "session_path": session_path,
    }));
}
```

### 路径 2：轮询 Watcher（回退路径）

当 Hook 不可信时（无 node / 未安装 / 版本过低），启动 session watcher 轮询：

```rust
// run_task 中：hook 可信时跳过轮询 watcher
let session_tx = if use_hooks {
    None  // 不创建转发通道，不启动轮询
} else {
    let (session_tx, session_rx) = mpsc::channel::<String>();
    spawn_status_session_watcher(
        app.clone(), task_id.clone(), project_path.clone(),
        is_codex, session_rx, pre_session_id, is_empty_prompt,
    );
    Some(session_tx)  // PTY reader 将原始输出转发给 watcher
};
```

#### Claude 会话发现（spawn_status_session_watcher）

对于 Claude ≥ 2.1.87，通过 `--session-id` 预指定会话 ID，简化发现：

```rust
// 1. 创建占位条目，用 pre_session_id 预占用路径
let placeholder_path = claude_session_path(&project_path, &pre_session_id);
tm.claude_sessions.lock().insert(task_id.clone(), ClaudeSessionInfo {
    session_id: pre_session_id.clone(),
    session_path: placeholder_path.clone(),
    is_placeholder: true,  // 标记为占位（尚未确认文件存在）
});
tm.claimed_session_paths.lock().insert(placeholder_path);

// 2. 等待文件创建 → 升级为非占位条目 → 通知前端
```

对于旧版 Claude，通过解析终端输出中的转义序列提取 session ID（兜底方案）：

```rust
// 从 PTY 输出中匹配 Claude Code 的 session ID 格式
// 格式类似于 "Session started: abc123-def456"
```

#### Codex 会话发现

```rust
fn spawn_status_session_watcher_for_codex(...) {
    // 1. 扫描 .codex/sessions/*.jsonl，按创建时间排序
    // 2. 匹配项目路径一致的、尚未被认领的会话
    // 3. 注册到 TaskManager + claim + 通知前端
}
```

### 兜底：终端输出提取

如果以上路径都失败（agent 异常退出等），从 PTY 终端的缓冲输出中提取 session ID：

```rust
// 在 PTY reader 中，session_tx 持续转发输出给 watcher
// watcher 在 agent 退出时最后解析一次输出，尝试提取 session ID
spawn_pty_reader(app, id, sink, emit_mode, reader, session_tx, on_finish);
```

## 三、会话认领（Claim）机制

避免多个任务争抢同一个会话文件的**认领机制**：

```rust
pub(crate) claimed_session_paths: Mutex<HashSet<String>>,

// 发现会话时认领
let mut claimed = tm.claimed_session_paths.lock();
claimed.insert(session_path.clone());

// 任务结束时释放
let mut claimed = tm.claimed_session_paths.lock();
if let Some(path) = codex_path { claimed.remove(&path); }
if let Some(path) = claude_path { claimed.remove(&path); }
```

## 四、TaskManager 中的会话存储

```rust
pub struct TaskManager {
    pub(crate) codex_sessions: Mutex<HashMap<String, CodexSessionInfo>>,
    pub(crate) claude_sessions: Mutex<HashMap<String, ClaudeSessionInfo>>,
    pub(crate) claimed_session_paths: Mutex<HashSet<String>>,
}

pub(crate) struct ClaudeSessionInfo {
    pub session_id: String,
    pub session_path: String,
    pub is_placeholder: bool,  // 是否为占位条目（文件尚未确认存在）
}

pub(crate) struct CodexSessionInfo {
    pub session_id: String,
    pub session_path: String,
}
```

## 五、会话等待与终态

任务子进程退出后，会话文件可能还在异步写入。Nezha 在判定终态前等待会话注册：

```rust
const SESSION_WAIT_MAX: Duration = Duration::from_millis(500);

fn wait_for_session(app: &AppHandle, task_id: &str, is_codex: bool) {
    let deadline = Instant::now() + SESSION_WAIT_MAX;
    while Instant::now() < deadline {
        if has_task_session(app, task_id, is_codex) { return; }
        std::thread::sleep(Duration::from_millis(50));
    }
}

// 在 exit_monitor 中，子进程退出后：
// 1. wait_for_session (500ms)
// 2. finalize_task_exit → 根据 exit_ok + had_agent_session 判定 done/failed
```

### 终态判定逻辑

```rust
fn finalize_task_exit(...) {
    // 检查是否有"真正"的 agent 会话（排除占位条目）
    let had_agent_session = if is_codex {
        codex_path.is_some()
    } else {
        claude_info.as_ref()
            .map(|info| !info.is_placeholder)  // 占位条目不算
            .unwrap_or(false)
    };

    // 正常退出 + 有会话 → done
    // 正常退出 + 无会话 → failed（agent 可能没成功启动）
    let status = if exit_ok || had_agent_session { "done" } else { "failed" };
}
```

## 六、会话消息读取

```rust
#[tauri::command]
pub async fn read_session_messages(
    session_path: String,
    offset: u64,
    limit: u64,
) -> Result<SessionMessages, String> {
    // 流式逐行读取 JSONL（而非全文件加载）
    let file = File::open(&session_path)?;
    let reader = BufReader::new(file);
    for line in reader.lines().skip(offset as usize).take(limit as usize) {
        let msg: SessionMessage = serde_json::from_str(&line?)?;
        messages.push(msg);
    }
}
```

> **已知债务**：当前实现仍使用 `fs::read_to_string` 全量加载，长会话（数百 MB）会 OOM。应改为流式逐行读取 + 分页。

## 七、会话导出

```rust
#[tauri::command]
pub async fn export_session_markdown(session_path: String) -> Result<String, String> {
    // 将 JSONL 会话转为 Markdown 格式
    // 解析 assistant/user 消息，保留代码块和工具调用结果
}
```
