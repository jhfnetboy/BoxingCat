# 终端系统设计

## 概述

Nezha 的核心交互界面是**嵌入式终端**——每个 Agent 任务和 Shell 会话都在一个完整的 PTY（伪终端）中运行，前端通过 xterm.js 渲染。这是整个应用最关键的技术子系统。

## 一、整体架构

```
┌──────────────────────────────────────────────────────┐
│                   Frontend (xterm.js)                 │
│                                                      │
│  TerminalView ── Terminal ── FitAddon                 │
│       │              │          └─ 自动适应容器尺寸    │
│       │              ├─ WebglAddon (GPU 渲染)          │
│       │              ├─ SerializeAddon (快照保存)      │
│       │              └─ Unicode11Addon                 │
│       │                                               │
│  useTerminalManager ── Channel.onmessage              │
│       │                    ▲                          │
│       └─ write(data) ──────┘                          │
│                                                      │
├──────────────────────────────────────────────────────┤
│                  Tauri IPC Layer                      │
│        Channel<String> (agent) / Event (shell)        │
├──────────────────────────────────────────────────────┤
│                   Backend (Rust)                      │
│                                                      │
│  portable-pty ── MasterPty ── Reader ── spawn_pty_reader │
│       │                                          │    │
│       ├─ SlavePty ── CommandBuilder               │    │
│       │       └─ Claude Code / Codex / Shell      │    │
│       │                                            │    │
│       └─ Writer ── send_input()                   │    │
│                                                      │
│  TaskManager (parking_lot::Mutex)                     │
│       ├─ pty_masters: HashMap<id, MasterPty>          │
│       ├─ pty_writers: HashMap<id, Writer>             │
│       └─ child_handles: HashMap<id, Child>            │
└──────────────────────────────────────────────────────┘
```

## 二、Rust 侧 PTY 管理

### PTY 创建（run_task / open_shell）

```rust
// 创建 PTY 对
let pair = native_pty_system()
    .openpty(PtySize {
        rows: rows.unwrap_or(50),
        cols: cols.unwrap_or(220),  // 220 列确保 TUI 完整显示
        pixel_width: 0,
        pixel_height: 0,
    })
    .map_err(|e| e.to_string())?;

// 构建命令
let mut cmd = if is_codex {
    build_codex_cmd(&agent_bin, &permission_mode)
} else {
    build_claude_cmd(&agent_bin, &permission_mode)
};
cmd.cwd(&project_path);
setup_env(&mut cmd);  // LANG, TERM=xterm-256color, COLORTERM=truecolor

// 在 slave 侧启动子进程
let child = pair.slave.spawn_command(cmd)?;
drop(pair.slave);  // slave 不再需要

// 获取 master 侧的读写句柄
let reader = pair.master.try_clone_reader()?;
let writer = pair.master.take_writer()?;

// 注册到全局 TaskManager
register_pty_handles(&task_manager, &task_id, pair.master, writer, child)?;
```

### PTY 读取与流控（spawn_pty_reader）

这是终端系统最精妙的部分——**有界 Channel 反压 + 批量发送**：

```rust
// 核心常量
const PTY_READ_BUFFER_SIZE: usize = 32 * 1024;       // 32KB 读缓冲
const PTY_EMIT_FLUSH_INTERVAL: Duration = 16ms;      // ~60fps 刷新间隔
const PTY_EMIT_MAX_BATCH_BYTES: usize = 64 * 1024;   // 单批最大 64KB
const PTY_EMIT_CHANNEL_CAPACITY: usize = 32;         // 有界 channel 容量
```

**反压机制详解**：

```
PTY master fd → reader 线程(32KB buf) → sync_channel(容量32)
                                              │
                                         emit worker 线程
                                         (16ms 或 64KB 触发 flush)
                                              │
                                         Channel.send() → 前端
```

当 Channel 容量满时：
1. `sync_channel::send()` 阻塞 reader 线程
2. OS PTY 内核缓冲区填满
3. 写入进程（Claude/Codex）的 `write()` 系统调用阻塞
4. 从源头限流——不丢数据、不乱序

```rust
fn spawn_pty_reader(
    app: AppHandle,
    id: String,
    sink: OutputSink,
    emit_mode: PtyEmitMode,
    reader: Box<dyn Read + Send>,
    session_tx: Option<Sender<String>>,
    on_finish: Option<Box<dyn FnOnce() + Send>>,
) {
    tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; PTY_READ_BUFFER_SIZE];
        let mut leftover: Vec<u8> = Vec::new();  // 不完整 UTF-8 字节缓存

        // 创建有界 sync_channel 用于批量发送
        let (emit_tx, emit_worker) = match emit_mode {
            PtyEmitMode::Batched { flush_interval, max_batch_bytes } => {
                let (tx, rx) = sync_channel::<String>(PTY_EMIT_CHANNEL_CAPACITY);
                let worker = thread::spawn(move || {
                    let mut batch = String::new();
                    loop {
                        match rx.recv_timeout(flush_interval) {
                            Ok(chunk) => {
                                batch.push_str(&chunk);
                                if batch.len() >= max_batch_bytes {
                                    flush_pty_batch(&app, &id, &sink, &mut batch);
                                }
                            }
                            Err(Timeout) => flush_pty_batch(&app, &id, &sink, &mut batch),
                            Err(Disconnected) => { flush_pty_batch(...); break; }
                        }
                    }
                });
                (Some(tx), Some(worker))
            }
            PtyEmitMode::Immediate => (None, None),  // Shell 走即时模式
        };

        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    // UTF-8 边界处理
                    let mut combined = take(&mut leftover);
                    combined.extend_from_slice(&buf[..n]);
                    let valid_len = match str::from_utf8(&combined) {
                        Ok(_) => combined.len(),
                        Err(e) => e.valid_up_to(),
                    };
                    if valid_len > 0 {
                        let data = unsafe {
                            str::from_utf8_unchecked(&combined[..valid_len]).to_owned()
                        };
                        // 可选转发给 session watcher
                        if let Some(ref tx) = session_tx {
                            let _ = tx.send(data.clone());
                        }
                        // 发送到前端（通过有界 channel 或直接发送）
                        if let Some(ref tx) = emit_tx {
                            match tx.send(data) {
                                Ok(()) => {}
                                Err(err) => send_pty_chunk(&app, &id, &sink, err.0),
                            }
                        } else {
                            send_pty_chunk(&app, &id, &sink, data);
                        }
                    }
                    // 缓存不完整字节
                    if valid_len < combined.len() {
                        leftover = combined[valid_len..].to_vec();
                    }
                }
            }
        }
        drop(emit_tx);  // 信号 worker 退出
        if let Some(worker) = emit_worker { let _ = worker.join(); }
        if let Some(f) = on_finish { f(); }
    });
}
```

### 环境变量设置

```rust
fn setup_env(cmd: &mut CommandBuilder) {
    cmd.env("LANG", "en_US.UTF-8");       // 确保中文等多字节输入
    cmd.env("LC_CTYPE", "en_US.UTF-8");
    cmd.env("TERM", "xterm-256color");    // 256 色支持
    cmd.env("COLORTERM", "truecolor");    // TrueColor 支持
}
```

### PTY 尺寸校验

`resize_pty` 有严格的尺寸校验，防止前端 bug 导致的畸形尺寸：

```rust
#[tauri::command]
pub async fn resize_pty(task_id: String, cols: u16, rows: u16) -> Result<(), String> {
    // 兜底：拒绝畸形尺寸
    if cols < 2 || rows < 2 || cols > 10_000 || rows > 10_000 {
        return Ok(());  // 静默拒绝，不报错
    }
    let masters = task_manager.pty_masters.lock();
    if let Some(master) = masters.get(&task_id) {
        master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })?;
    }
    Ok(())
}
```

## 三、前端 xterm.js 集成

### TerminalView 组件

```typescript
export function TerminalView({
  onInput, onResize, onRegisterTerminal, onReady,
  themeVariant, terminalFontSize, monoFontFamily,
  isActive, initialData, initialSnapshot, onSnapshot,
}: TerminalViewProps) {
  // 初始化终端
  const { term, fitAddon } = initTerminal(themeVariant, 1000, terminalFontSize, monoFontFamily);

  // 加载插件
  term.loadAddon(new SerializeAddon());
  loadWebglAddon(term);  // GPU 渲染（失败时回退 DOM）

  // 智能复制处理
  attachSmartCopy(term, { matchesNewline, onNewline });

  // WebKit 特殊处理
  attachMacWebKitShiftInputFix(term);  // macOS 中文输入法修复
  attachLinuxIMEFix(term, onInput);    // Linux 输入法修复

  // ResizeObserver 防抖 50ms
  const resizeObserver = new ResizeObserver(() => {
    resizeTimer = setTimeout(() => {
      const s = safeFit(fitAddon, term, container);
      if (s) notifyResize(s.cols, s.rows);
    }, 50);
  });
}
```

### onResize 去重

前端做了三层 resize 去重：

```typescript
// 仅在 cols/rows 真正变化时回调；避免每次切回都触发 SIGWINCH → TUI 重绘
const notifyResize = useCallback((cols: number, rows: number) => {
  const last = lastSizeRef.current;
  if (last && last.cols === cols && last.rows === rows) return;
  lastSizeRef.current = { cols, rows };
  onResizeRef.current(cols, rows);
}, []);
```

### 快照保存/恢复

切换任务面板时保存终端快照，切回时恢复：

```typescript
// 组件卸载时保存快照
const snapshot = serializeAddon.serialize();

// 组件挂载时恢复
if (initialSnapshot) {
  term.write(initialSnapshot, () => {
    if (initialData) term.write(initialData, completeRestore);
  });
}
```

## 四、useTerminalManager Hook

### 批量写入策略

前端通过 `useTerminalManager` hook 实现 **RAF（requestAnimationFrame）+ pendingOutputs** 批量策略：

```typescript
const DRAIN_FRAME_BUDGET = 128 * 1024; // 每帧最多处理 128KB

const drainPendingOutputs = useCallback(() => {
  rafIdRef.current = 0;
  // 如果用户正在输入，推迟到下一帧
  if (navigator.scheduling?.isInputPending?.()) {
    rafIdRef.current = requestAnimationFrame(drainPendingOutputs);
    return;
  }
  const pendingOutputs = pendingOutputsRef.current;
  let bytesThisFrame = 0;
  for (const [taskId, chunks] of pendingOutputs) {
    const joined = chunks.length === 1 ? chunks[0] : chunks.join("");
    if (terminalWriteRefs.current[taskId]) {
      enqueueTerminalWrite(taskId, joined);
    }
    if (taskId in taskBufferRef.current) {
      pushToBuffer(taskBufferRef.current[taskId], joined);
    }
    pendingOutputs.delete(taskId);
    bytesThisFrame += joined.length;
    if (bytesThisFrame >= DRAIN_FRAME_BUDGET) break;  // 超出预算则延后
  }
  if (pendingOutputs.size > 0 && !rafIdRef.current) {
    rafIdRef.current = requestAnimationFrame(drainPendingOutputs);
  }
}, [enqueueTerminalWrite]);
```

### 终端的 ready/pending 模式

终端初始化是异步的（WebGL 加载、字体加载），输出可能在终端就绪前到达：

```typescript
const createTerminalWriteState = (generation = 0) => ({
  pending: [] as string[],
  ready: false,
  generation,
});

const enqueueTerminalWrite = (taskId: string, data: string) => {
  const state = terminalWriteStateRef.current[taskId];
  if (!state.ready) {
    state.pending.push(data);  // 缓存，等终端就绪后批量写入
    return;
  }
  const writeFn = terminalWriteRefs.current[taskId];
  if (writeFn) writeFn(data);
};

// 终端就绪后消费 pending
const handleTerminalReady = (taskId: string, generation: number) => {
  const state = terminalWriteStateRef.current[taskId];
  if (!state || state.generation !== generation) return;  // generation 防止过期回调
  state.ready = true;
  if (state.pending.length > 0) {
    const writeFn = terminalWriteRefs.current[taskId];
    if (writeFn) {
      const data = state.pending.length === 1
        ? state.pending[0]
        : state.pending.join("");
      writeFn(data);
    }
    state.pending = [];
  }
};
```

### 智能 Writer

`createSmartWriter` 在 WritingView 挂载/卸载时自动衔接：

```typescript
const createSmartWriter = (term: Terminal): SmartWriter => {
  let writing = true;
  const write = (data: string, callback?: () => void) => {
    if (writing) {
      term.write(data, callback);
    } else {
      callback?.();
    }
  };
  return {
    write,
    // 当切换面板时暂停写入，防止旧面板报 "terminal disposed" 异常
    pause: () => { writing = false; },
    resume: () => { writing = true; },
  };
};
```

## 五、关键设计决策

### 1. Shell 走 Event，Agent 走 Channel

- **Shell**：可能有多个面板同时挂载，走 `emit/shell-output` 事件
- **Agent**：单一订阅者，走 `Channel` 直投，零 JSON 开销

### 2. 批量 vs 即时发送

- **Agent 任务**：Batched 模式（16ms/64KB），重视吞吐
- **嵌入式 Shell**：Immediate 模式，重视交互响应

### 3. 内存边界控制

```typescript
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;  // 10MB 上限
const MAX_BUFFER_CHUNKS = 256;             // 256 个 chunk 后合并

function pushToBuffer(buf: TaskBuffer, data: string): void {
  buf.chunks.push(data);
  buf.totalLen += data.length;
  // 超过 10MB 时从头部丢弃
  while (buf.totalLen > MAX_BUFFER_SIZE && buf.chunks.length > 0) {
    const dropped = buf.chunks.shift()!;
    buf.totalLen -= dropped.length;
    buf.droppedLen += dropped.length;  // 记录丢弃量用于偏移计算
  }
  // 超过 256 个 chunk 时合并，防止数组过长
  if (buf.chunks.length > MAX_BUFFER_CHUNKS) {
    const merged = buf.chunks.join("");
    buf.chunks = [merged];
  }
}
```

### 4. 跨平台 xterm 鼠标行为

```rust
// 仅 macOS 注入：Claude Code v2.1.150+ 默认开 xterm 鼠标上报（mode 1002），
// 会吞掉 macOS 端 xterm.js 的原生拖动框选；关掉后滚轮回退到 xterm scrollback。
#[cfg(target_os = "macos")]
cmd.env("CLAUDE_CODE_DISABLE_MOUSE", "1");
```
