# Hook 事件系统

## 概述

Nezha 通过向 Claude Code / Codex CLI 注入 **Hook 脚本** 来实现 Agent 生命周期的**零轮询监控**。Hook 脚本在 Agent 进程内触发，将事件写入文件，Nezha 的文件 watcher 实时读取并转发给前端。

## 一、设计动机

### 轮询模式的问题

在没有 Hook 之前，Nezha 需要通过轮询来发现会话和获取状态：
- 每 1 秒执行 `claude status` 或检查文件系统
- 状态更新有 1 秒延迟
- 多次子进程启动开销

### Hook 模式的优势

- **近实时**：事件通过文件系统 watcher + 200ms 兜底扫描，延迟 < 200ms
- **零子进程**：不额外启动 `claude status` 进程
- **精准事件**：SessionStart、Stop、Notification 等细粒度事件
- **环境变量守卫**：用户在 Nezha 外手动跑 Agent 时 hook 脚本立即 exit 0

## 二、架构

```
Claude Code / Codex 进程
  │
  ├─ Hook 事件触发 (SessionStart, Stop, Notification, ...)
  │
  └─ 执行: node ~/.nezha/hooks/nezha-hook.mjs
       │
       │  环境变量: NEZHA_TASK_ID, NEZHA_EVENT_DIR, NEZHA_AGENT
       │
       └─ 追加 JSON 行到 ~/.nezha/events/<task_id>/events.jsonl
            │
            │
    ┌───────┴──────────────────────────────────────────┐
    │  event_watcher.rs (长驻线程)                      │
    │                                                    │
    │  notify::RecommendedWatcher (文件系统事件)          │
    │  + 1s 兜底轮询 (FALLBACK_INTERVAL)                 │
    │                                                    │
    │  ┌─ read_and_dispatch(file, offset)                │
    │  │   ├─ 维护 per-file byte offset                  │
    │  │   ├─ 只读增量行                                  │
    │  │   └─ 解析 JSON → dispatch()                     │
    │  │                                                 │
    │  └─ dispatch(event):                               │
    │      ├─ SessionStart → 注册 session + emit         │
    │      ├─ Notification/PermissionRequest →           │
    │      │       input_required                        │
    │      ├─ UserPromptSubmit/PostToolUse → running     │
    │      └─ Stop → input_required                      │
    │                                                    │
    │  emit("task-status") / emit("task-session")        │
    └──────────────────┬─────────────────────────────────┘
                       │
                 前端 React 组件
```

## 三、Hook 注入机制

### 两种注入策略

| Agent | 注入方式 | 配置文件 | 隔离性 |
|-------|----------|----------|--------|
| Claude | 命令行 `--settings` | `~/.nezha/hooks/claude-settings.json` (Nezha 自有) | ✅ 不修改用户 `~/.claude/settings.json` |
| Codex | TOML 标记块 | `~/.codex/config.toml` (标记包裹) | ✅ `# >>> nezha-managed-begin >>>` 区域隔离 |

### Claude Hook 注入

```rust
// 写入 Nezha 自有 settings 文件
fn write_claude_settings(node_path: &str, script: &str) -> Result<PathBuf, String> {
    let path = nezha_claude_settings_path()?; // ~/.nezha/hooks/claude-settings.json
    let value = serde_json::json!({
        "hooks": {
            "SessionStart": [{ "hooks": [{ "type": "command", "command": "node \"script.mjs\"" }] }],
            "Notification": [...],
            "PostToolUse": [...],
            "Stop": [...],
            "SubagentStop": [...],
            "UserPromptSubmit": [...],
        }
    });
    atomic_write(&path, &serde_json::to_string_pretty(&value)?)?;
    Ok(path)
}

// 启动任务时通过 --settings 传入
if use_hooks {
    if let Ok(p) = crate::hooks::nezha_claude_settings_path() {
        c.arg("--settings");
        c.arg(p.to_string_lossy().as_ref());
    }
}
```

Claude 对 hooks 按 event 做**跨来源 merge + 按 command 去重**，Nezha 的 `--settings` 不会覆盖用户在 `~/.claude/settings.json` 中定义的 hooks。

### Codex Hook 注入

```rust
// 在 ~/.codex/config.toml 中用标记块注入
const CODEX_BEGIN: &str = "# >>> nezha-managed-begin (do not edit; managed by Nezha) >>>";
const CODEX_END: &str = "# <<< nezha-managed-end <<<";

fn build_codex_block(node_path: &str, script: &str) -> String {
    let mut out = String::new();
    out.push_str(CODEX_BEGIN);
    out.push('\n');
    for event in CODEX_EVENTS {
        out.push_str(&format!("[[hooks.{}]]\n", event));
        out.push_str(&format!("[[hooks.{}.hooks]]\n", event));
        out.push_str("type = \"command\"\n");
        out.push_str(&format!("command = {}\n", toml_quote(&hook_command(script))));
        out.push('\n');
    }
    out.push_str(CODEX_END);
    out
}
```

### Hook 命令的跨 Shell 安全

```rust
// ✅ 正确：裸 node + 双引号脚本路径
// cmd.exe / PowerShell / Git Bash / sh 都把它解析成"调用 PATH 上的 node"
fn hook_command(script: &str) -> String {
    format!("node \"{}\"", script)
}

// ❌ 错误：带引号的 node 全路径
// PowerShell 会把首个 token 当字符串字面量，报 UnexpectedToken
// format!("\"{}\" \"{}\"", node_path, script)
```

### 环境变量守卫

```rust
fn setup_nezha_env(cmd: &mut CommandBuilder, task_id: &str, agent: &str) {
    if let Ok(dir) = crate::hooks::events_dir_for(task_id) {
        cmd.env("NEZHA_TASK_ID", task_id);
        cmd.env("NEZHA_EVENT_DIR", dir.to_string_lossy().as_ref());
        cmd.env("NEZHA_AGENT", agent);
    }
}
```

Hook 脚本在入口处检查 `NEZHA_TASK_ID` + `NEZHA_EVENT_DIR` 两个环境变量：
- **同时存在** → 正常上报事件
- **缺失任一** → `process.exit(0)`，无副作用

## 四、事件 Watcher（event_watcher.rs）

### 长驻线程 + 文件系统事件

```rust
fn run_loop(app: AppHandle) {
    // 启动时清理残留 events 目录
    let _ = fs::remove_dir_all(&events_root);
    let _ = fs::create_dir_all(&events_root);

    // 创建文件系统 watcher
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher_opt = notify::RecommendedWatcher::new(tx, Config::default())
        .ok()
        .and_then(|mut w| {
            w.watch(&events_root, RecursiveMode::Recursive).ok()?;
            Some(w)
        });

    let mut offsets: HashMap<PathBuf, u64> = HashMap::new();

    loop {
        // 事件驱动等待 + 1s 兜底超时
        if watcher_opt.is_some() {
            match rx.recv_timeout(FALLBACK_INTERVAL) {
                Ok(_) | Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => watcher_opt = None,
            }
            while rx.try_recv().is_ok() {}  // 合并同一批事件
        } else {
            thread::sleep(FALLBACK_INTERVAL);  // watcher 不可用时的回退
        }

        // 扫描所有任务目录的 events.jsonl
        for entry in fs::read_dir(&events_root)? {
            let file = entry.path().join("events.jsonl");
            let offset = *offsets.entry(file.clone()).or_insert(0);
            if let Some(new_offset) = read_and_dispatch(&app, &file, offset) {
                offsets.insert(file, new_offset);
            }
        }
    }
}
```

### 增量读取

```rust
fn read_and_dispatch(app: &AppHandle, path: &PathBuf, offset: u64) -> Option<u64> {
    let mut file = fs::File::open(path).ok()?;
    let size = file.metadata().ok()?.len();
    if size <= offset { return Some(offset); }  // 无新数据

    file.seek(SeekFrom::Start(offset)).ok()?;
    let mut buf = String::new();
    file.read_to_string(&mut buf).ok()?;

    // 只处理完整行（以 \n 结尾），残行留待下次
    let mut last_complete_end = 0;
    for (idx, ch) in buf.char_indices() {
        if ch == '\n' {
            let line = &buf[last_complete_end..idx];
            last_complete_end = idx + 1;
            if let Ok(ev) = serde_json::from_str::<HookEvent>(line) {
                dispatch(app, &ev);
            }
        }
    }
    Some(offset + last_complete_end as u64)
}
```

### 事件分发

```rust
fn dispatch(app: &AppHandle, ev: &HookEvent) {
    match ev.event.as_str() {
        "SessionStart" => handle_session_start(app, ev),
        "Notification" | "PermissionRequest" =>
            emit_active_status(app, ev, "input_required"),
        "UserPromptSubmit" | "PostToolUse" =>
            emit_active_status(app, ev, "running"),
        "Stop" =>
            emit_active_status(app, ev, "input_required"), // 进程不退出，等待下一条输入
        "SubagentStop" => {} // 不主动 emit
        _ => {}
    }
}
```

### 状态去重

`PostToolUse` 会按每次工具调用高频触发，每次都 emit `running` 会导致前端无谓的 setState。event_watcher 做去重：

```rust
static LAST_STATUS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn emit_active_status(app: &AppHandle, ev: &HookEvent, status: &str) {
    // 仅进程仍存活时才广播
    if !tm.child_handles.lock().contains_key(&ev.task_id) { return; }
    // 状态未变化则跳过
    let mut last = last_status().lock();
    if last.get(&ev.task_id).map(String::as_str) == Some(status) { return; }
    last.insert(ev.task_id.clone(), status.to_string());
    let _ = app.emit("task-status", json!({"task_id": ev.task_id, "status": status}));
}
```

## 五、信任检查与版本门槛

Hook 链路可信需同时满足三条：

```rust
pub fn usable_for(agent: &str) -> bool {
    let status = status_cache().lock().clone();
    if status.node_path.is_empty() { return false; }           // ① node 可用
    if agent == "codex" {
        status.codex_installed                                  // ② hook 已安装
            && codex_version_gte("0.131.0")                   // ③ 版本 ≥ 门槛
    } else {
        status.claude_installed
            && claude_version_gte("2.1.87")
    }
}
```

| 条件 | Claude 门槛 | Codex 门槛 | 说明 |
|------|-------------|------------|------|
| Hook 事件支持 | ≥ 2.1.87 | ≥ 0.131.0 | 基础 hook 机制 |
| `--session-id` | ≥ 2.1.87 | N/A | 预指定会话 ID |
| `--dangerously-bypass-hook-trust` | N/A | ≥ 0.131.0 | 免信任运行 Nezha hook |

**不可信时回退到轮询 watcher**：Node 不可用 / 未安装 / 版本过低时，不注入 `NEZHA_*` 环境变量，并行启动 `/status` 轮询 watcher。

## 六、安全性

1. **环境变量守卫**：hook 脚本只在同时有 `NEZHA_TASK_ID` + `NEZHA_EVENT_DIR` 时激活
2. **版本门槛**：低于最低版本的 Agent 不注入 hook，防止兼容性问题
3. **隔离配置**：Claude 用 `--settings` 传自有文件，Codex 用标记块，均不修改用户配置
4. **卸载干净**：uninstall 删除 Nezha 自有文件 + 清理标记块，不残留
5. **Codex hook trust**：Nezha 注入的 hook 对 Codex 是新 hash，默认要求 trust；通过 `--dangerously-bypass-hook-trust` 跳过
