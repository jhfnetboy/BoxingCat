# 前后端通信机制

## 概述

Nezha 的前端（React/TypeScript）与后端（Rust/Tauri）通信基于 **三种 IPC 通路**，各司其职：

| 通路 | 方向 | 用途 | 特点 |
|------|------|------|------|
| `invoke` | 前端→后端 | 命令调用 | 请求-响应模式，支持返回值 |
| `emit` / `listen` | 后端→前端 | 事件广播 | 全局广播，适合状态变更通知 |
| `Channel` | 后端→前端 | 流式数据 | 点对点推送，绕过事件总线 |

## 一、Tauri Command（invoke）

### Rust 侧注册

所有命令在 `src-tauri/src/lib.rs` 的 `invoke_handler!` 宏中集中注册：

```rust
.invoke_handler(tauri::generate_handler![
    pty::run_task,
    pty::cancel_task,
    git::git_status,
    git::git_commit,
    fs::read_file_content,
    storage::save_projects,
    // ... 共 60+ 个命令
])
```

每个命令是一个 `#[tauri::command]` 标注的异步函数，通过 `State<'_, TaskManager>` 访问全局状态：

```rust
#[tauri::command]
pub async fn git_status(
    project_path: String,
) -> Result<Vec<GitFileChange>, String> {
    // ...
}
```

### 前端侧调用

```typescript
import { invoke } from "@tauri-apps/api/core";

// 类型化调用
const status = await invoke<GitFileChange[]>("git_status", {
  projectPath: "/path/to/project",
});
```

### 关键约定

1. **参数命名**：Rust 侧使用 `snake_case`，Tauri 自动转换为前端的 `camelCase`
2. **错误处理**：返回 `Result<T, String>`，前端通过 try/catch 捕获
3. **阻塞操作**：涉及 I/O 的命令必须包裹 `tokio::task::spawn_blocking`，避免阻塞 Tokio 异步运行时

```rust
// ✅ 正确：阻塞操作放入 spawn_blocking
#[tauri::command]
pub async fn git_discard_file(project_path: String, file_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 同步 git 操作
        run_git_check(&project_path, &["restore", "--", &file_path])
    })
    .await
    .map_err(|e| e.to_string())?
}

// ❌ 错误：在 async fn 中直接调用阻塞操作
#[tauri::command]
pub async fn bad_example() -> Result<(), String> {
    std::process::Command::new("git").output() // 阻塞整个 Tokio 线程！
}
```

## 二、事件总线（emit/listen）

### 后端 emit

Rust 侧通过 `app.emit()` 向所有前端窗口广播事件：

```rust
// 任务状态变更
let _ = app.emit("task-status", serde_json::json!({
    "task_id": task_id,
    "status": "running"
}));

// 会话发现
let _ = app.emit("task-session", serde_json::json!({
    "task_id": task_id,
    "session_id": session_id,
    "session_path": session_path,
}));
```

Nezha 使用的事件类型：

| 事件名 | payload | 触发时机 |
|--------|---------|----------|
| `task-status` | `{ task_id, status, failure_reason? }` | 任务状态变更（running/done/failed/cancelled/input_required） |
| `task-session` | `{ task_id, session_id, session_path }` | 会话文件被发现 |
| `shell-output` | `{ shell_id, data }` | Shell PTY 输出（走 emit，不走 Channel） |

### 前端 listen

```typescript
import { listen } from "@tauri-apps/api/event";

useEffect(() => {
  const unlisten = listen<TaskStatusEvent>("task-status", (event) => {
    setTasks(prev => updateTaskStatus(prev, event.payload));
  });
  return () => { unlisten.then(fn => fn()); };
}, []);
```

### 事件总线的局限

`emit` 是 **全局广播**——所有窗口都收到、payload 需 JSON 序列化。高频率事件（如 PTY 输出每秒数千次）走 emit 会导致：
- JSON 序列化/反序列化开销
- 不相关组件的无谓唤醒

因此 Nezha 对高频数据（Agent 终端输出）使用了 **第三种通路**。

## 三、IPC Channel（点对点流）

### 设计动机

Agent 任务的 PTY 输出是高频流式数据（每秒数千次写入），不适合走全局事件总线。Tauri 2 提供了 `tauri::ipc::Channel`，允许后端将数据**直投**到**单个前端订阅者**，完全绕过事件总线。

### Rust 侧

`run_task` 命令接收一个 `on_output: Channel<String>` 参数：

```rust
#[tauri::command]
pub async fn run_task(
    // ... 其他参数
    on_output: Channel<String>,  // ← Tauri IPC Channel
) -> Result<(), String> {
    // 启动 PTY reader，输出走 Channel 直投
    spawn_pty_reader(
        app.clone(),
        task_id.clone(),
        OutputSink::Channel(on_output),  // ← 选择 Channel 通路
        PtyEmitMode::Batched { ... },
        reader,
        session_tx,
        None,
    );
    Ok(())
}
```

`OutputSink` 枚举统一了两种数据投递路径：

```rust
enum OutputSink {
    Event { event_name: &'static str, id_key: &'static str },  // emit 事件
    Channel(Channel<String>),                                   // IPC Channel
}

fn send_pty_chunk(app: &AppHandle, id: &str, sink: &OutputSink, data: String) {
    match sink {
        OutputSink::Event { event_name, id_key } => {
            let payload = serde_json::json!({ id_key: id, "data": data });
            let _ = app.emit(event_name, payload);  // JSON 序列化 + 全局广播
        }
        OutputSink::Channel(channel) => {
            let _ = channel.send(data);  // 直接发送字符串，无序列化
        }
    }
}
```

### 前端侧

前端创建 `Channel` 对象，传入 `invoke`，并注册 `onmessage` 回调：

```typescript
import { Channel, invoke } from "@tauri-apps/api/core";

// hook 中创建 Channel
const createOutputChannel = useCallback(
  (taskId: string): Channel<string> => {
    const channel = new Channel<string>();
    channel.onmessage = (data) => ingestAgentChunk(taskId, data);
    return channel;
  },
  [ingestAgentChunk],
);

// 调用命令时传入 channel
await invoke("run_task", {
  taskId,
  projectPath,
  prompt,
  agent,
  permissionMode,
  onOutput: createOutputChannel(taskId),  // ← Channel 作为参数
});
```

### Channel vs Event 对比

| 维度 | Channel | Event (emit/listen) |
|------|---------|---------------------|
| 序列化 | 无（字符串直传） | JSON 序列化/反序列化 |
| 接收者 | 单一订阅者 | 全局广播 |
| 适用场景 | 高频流式数据 | 状态变更通知 |
| 开销 | 极低 | 中等 |

### 选择策略

- **Agent 终端输出** → `Channel`（高频、单订阅者）
- **Shell 终端输出** → `Event`（多面板可能同时挂载）
- **任务状态变更** → `Event`（多个组件需要响应）
- **会话发现** → `Event`（全局通知）

## 四、通信架构图

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│                                                         │
│  invoke("git_status")  ────────┐                        │
│  Channel.onmessage ◄───────────┼──┐                     │
│  listen("task-status") ◄───────┼──┼──┐                  │
│                                │  │  │                  │
├────────────────────────────────┼──┼──┼──────────────────┤
│                     Tauri IPC Layer                      │
│                                │  │  │                  │
├────────────────────────────────┼──┼──┼──────────────────┤
│                     Backend (Rust)                       │
│                                │  │  │                  │
│  #[tauri::command]  ◄──────────┘  │  │                  │
│  Channel<String>.send() ──────────┘  │                  │
│  app.emit("task-status") ────────────┘                  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              TaskManager (Mutex-protected)        │   │
│  │  pty_masters, pty_writers, child_handles,         │   │
│  │  claude_sessions, codex_sessions,                 │   │
│  │  cancelled_tasks, ...                             │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 五、最佳实践总结

1. **高频数据用 Channel**：PTY 输出、文件流等场景，避免 JSON 序列化开销和全局广播
2. **状态通知用 Event**：任务状态变更这类低频、多消费者场景适用
3. **请求-响应用 invoke**：查询类操作（git status、文件读取）适合命令模式
4. **阻塞操作必须 spawn_blocking**：Rust 侧所有 I/O/进程操作必须脱离 Tokio 线程
5. **Channel 反压控制**：`spawn_pty_reader` 使用有界 `sync_channel`（容量 32），满时 reader 线程阻塞，反压传播至 OS PTY 缓冲区，从源头限流
