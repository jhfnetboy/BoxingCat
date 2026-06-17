# 性能优化模式

## 概述

Nezha 面临的核心性能挑战是**高频 PTY 输出**（Agent 运行 `npm install` 时可产生 25000+ 次输出事件）和**大量 DOM 节点**（会话消息 5000+ 条）。本文档总结 Nezha 中的关键性能优化模式。

## 一、PTY 输出管道优化

### 问题

原始方案每读取一次 PTY 就 emit 一次事件，导致：
- 每次 JSON 序列化/反序列化
- 全局事件总线广播
- 前端每次 setState 触发 React 重渲染

### 优化：Channel 直投 + 批量发送

```
原始: reader → emit("shell-output", {id, data: JSON}) → 全局广播 → 前端
优化: reader → sync_channel(32) → batch(16ms/64KB) → Channel.send(string) → 单一订阅者
```

**效果**：JSON 序列化开销消除，事件广播消除，前端 setState 频率从每秒 1000+ 次降至 ~60 次。

### 三层缓冲

| 层级 | 位置 | 缓冲大小 | 策略 |
|------|------|----------|------|
| OS PTY buffer | 内核 | ~64KB | 内核默认 |
| sync_channel | Rust reader 线程 | 32 条消息 | 满时阻塞 reader → 反压至 OS/进程 |
| batch buffer | Rust emit worker | 最大 64KB | 16ms 或满时 flush |

### 反压传播链

```
前端消费慢 → Channel 满 → sync_channel.send() 阻塞
  → reader 线程暂停 → OS PTY buffer 满
    → 写入进程 write() 阻塞 → 从源头限流
```

不丢数据、不乱序、不爆内存。

## 二、RAF 批量消费

前端的 `useTerminalManager` hook 使用 `requestAnimationFrame` 来批量处理到达的 PTY 数据：

```typescript
const DRAIN_FRAME_BUDGET = 128 * 1024; // 每帧最多处理 128KB

const drainPendingOutputs = useCallback(() => {
  rafIdRef.current = 0;

  // 用户正在输入时，推迟重渲染
  if (navigator.scheduling?.isInputPending?.()) {
    rafIdRef.current = requestAnimationFrame(drainPendingOutputs);
    return;
  }

  let bytesThisFrame = 0;
  for (const [taskId, chunks] of pendingOutputs) {
    const joined = chunks.join("");
    // 写入 xterm.js + 追加到 buffer
    enqueueTerminalWrite(taskId, joined);
    pushToBuffer(taskBufferRef.current[taskId], joined);
    pendingOutputs.delete(taskId);

    bytesThisFrame += joined.length;
    if (bytesThisFrame >= DRAIN_FRAME_BUDGET) break;  // 超出预算则延后
  }

  // 还有剩余数据，继续调度下一帧
  if (pendingOutputs.size > 0 && !rafIdRef.current) {
    rafIdRef.current = requestAnimationFrame(drainPendingOutputs);
  }
}, []);
```

### 关键特性

1. **帧预算控制**：每帧最多 128KB，防止单帧阻塞太久
2. **isInputPending**：用户输入时暂停渲染，保证交互响应
3. **chunk 合并**：同一帧内同一 task 的多个 chunks 合并为一次 join/write

## 三、Generation 模式防过期回调

前端 terminal 的初始化是异步的（WebGL 加载、字体加载等），输出可能在 terminal 就绪前到达。Nezha 使用 **generation** 模式防止过期回调误操作：

```typescript
const createTerminalWriteState = (generation = 0) => ({
  pending: [] as string[],
  ready: false,
  generation,
});

const resetTerminalWriteState = (taskId: string) => {
  const prev = terminalWriteStateRef.current[taskId];
  const next = createTerminalWriteState((prev?.generation ?? 0) + 1);
  terminalWriteStateRef.current[taskId] = next;
  return next;
};

const handleTerminalReady = (taskId: string, generation: number) => {
  const state = terminalWriteStateRef.current[taskId];
  // 过期回调：terminal 已被新的替换
  if (!state || state.generation !== generation) return;
  state.ready = true;
  // 消费 pending 数据...
};
```

`generation` 在 terminal 重新注册时递增，旧 terminal 的 `onReady` 回调中的 generation 不匹配，被静默忽略。

## 四、内存边界控制

### 终端缓冲区

```typescript
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;  // 10MB 硬上限
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

  // 超过 256 个 chunk 时合并（防止数组过长导致的 V8 性能退化）
  if (buf.chunks.length > MAX_BUFFER_CHUNKS) {
    const merged = buf.chunks.join("");
    buf.chunks = [merged];
  }
}
```

### 快照 + 增量恢复

切换任务面板时，保存 xterm.js 快照 + buffer 偏移：

```typescript
// 保存快照
const handleSnapshot = (taskId: string, snapshot: string) => {
  const buf = taskBufferRef.current[taskId];
  const pendingLen = state?.pending.reduce((s, c) => s + c.length, 0) ?? 0;
  terminalSnapshotRef.current[taskId] = {
    snapshot,
    bufferLength: buf ? Math.max(0, getBufferAbsLen(buf) - pendingLen) : 0,
  };
};

// 恢复：快照 + 增量数据
const getTaskRestoreState = (taskId: string) => {
  return {
    initialSnapshot: snapshotState.snapshot,         // xterm 渲染快照
    initialData: joinBufferFrom(buf, bufferLength),   // 快照之后的增量
  };
};
```

这允许在面板间快速切换而无需保留完整终端 DOM。

## 五、事件去重

### Hook 事件去重

```rust
static LAST_STATUS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn emit_active_status(app: &AppHandle, ev: &HookEvent, status: &str) {
    let mut last = last_status().lock();
    // 状态未变化 → 跳过 emit，前端不触发 setState
    if last.get(&ev.task_id).map(String::as_str) == Some(status) { return; }
    last.insert(ev.task_id.clone(), status.to_string());
    let _ = app.emit("task-status", json!({ "task_id": ev.task_id, "status": status }));
}
```

### PTY 尺寸去重

前端 resize 做了三层去重：
1. ResizeObserver 50ms 防抖
2. `notifyResize` 只在 cols/rows 真正变化时回调
3. Rust `resize_pty` 拒绝畸形尺寸 (`cols < 2 || cols > 10000`)

## 六、Rust 侧性能规则

### Tokio 线程不阻塞

```rust
// ✅ 所有阻塞 I/O 包裹在 spawn_blocking 中
#[tauri::command]
pub async fn git_discard_all(project_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 同步 git 操作
        run_git_check(&root, &["restore", "--source=HEAD", "--staged", "--worktree", "."])?;
        for rel in list_untracked_files(&root)? {
            trash::delete(&target)?;
        }
    }).await?
}
```

### Mutex 锁粒度

```rust
// ✅ 短临界区：只锁数据结构操作
let child_arc = task_manager.child_handles.lock().get(&task_id).cloned();
// 锁已释放，后续操作不持锁
if let Some(arc) = child_arc {
    let _ = arc.lock().unwrap().kill();
}

// ❌ 避免：持锁期间执行 I/O
let mut writers = task_manager.pty_writers.lock();
writers.get_mut(&task_id).write_all(data)?;  // write_all 在锁内
```

正确的做法是先 clone/取出资源再释放锁，或缩短临界区。

### 文件读取

```rust
// ❌ 避免：全文件一次性加载
let raw = fs::read_to_string(&path)?;  // 数百 MB 的 JSONL 会 OOM

// ✅ 正确：流式逐行读取
let reader = BufReader::new(File::open(&path)?);
for line in reader.lines() {
    // 逐行处理
}
```

## 七、前端性能规则

### 1. 高频回调中避免 setState

```typescript
// ✅ Channel.onmessage 中不直接 setState
channel.onmessage = (data) => ingestAgentChunk(taskId, data);
  // → 进入 pendingOutputs Map
  // → RAF 批量 drain
  // → 一次性写入 xterm.js（绕过 React 渲染）

// 而非每收到一个 chunk 就 setState({ output: prev + data })
```

### 2. 大列表虚拟化

```typescript
// GitChanges（文件列表）、SessionView（会话消息）
// 数据量大时（1000+ 文件变更、5000+ 消息）
// 应考虑虚拟滚动（react-window / @tanstack/virtual）
```

### 3. persistProjectTasks 防抖

```typescript
// 当前每次状态变更都立即 invoke("save_project_tasks")
// 高频场景下造成冗余磁盘 I/O
// → 应对同一 projectId 的连续写入做 300-500ms 防抖
```

### 4. CodeMirror 语言包按需加载

```typescript
// 当前所有语言包静态导入，主包 ~2MB
// → 改为动态 import()：仅加载当前打开文件的语言
```

## 八、性能监控指标

| 指标 | 目标 | 当前状态 |
|------|------|----------|
| PTY 输出延迟 | < 16ms (1帧) | ✅ Channel + RAF |
| 终端渲染帧率 | ≥ 60fps | ✅ WebGL addon |
| 任务切换延迟 | < 100ms | ✅ 快照 + 增量 |
| 内存（单任务） | < 50MB | ✅ 10MB buffer 上限 |
| 内存（10 个任务） | < 200MB | ⚠️ 取决于 buffer 配置 |
| 构建产物体积 | < 5MB (前端) | ⚠️ 当前 ~2MB（语言包静态导入） |
