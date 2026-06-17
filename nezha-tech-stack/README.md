# Nezha 技术栈全景

## 一句话定位

Nezha 是一款基于 **Tauri 2** 的桌面 AI 编程助手任务管理器，前端用 **React 19 + TypeScript + Vite**，后端用 **Rust**，通过 **PTY（伪终端）** 驱动 Claude Code / Codex CLI 进程，实现终端输出实时查看、会话自动发现、Git 集成和用量分析。

## 技术栈速览

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 桌面壳 | Tauri 2 | 2.x | 跨平台桌面应用框架 |
| 后端语言 | Rust | edition 2021 | 所有系统级操作 |
| 前端框架 | React | 19.2 | UI 渲染 |
| 构建工具 | Vite | 8.0 | 前端打包与 HMR |
| 类型系统 | TypeScript | 6.0 (strict) | 全量类型覆盖 |
| 终端模拟 | xterm.js | 6.0 | 前端终端渲染 |
| PTY 库 | portable-pty | 0.8 | Rust 侧伪终端管理 |
| 异步运行时 | Tokio | 1.x | Rust 异步操作 |
| 代码高亮 | Shiki | 4.0 | 代码预览语法高亮 |
| 编辑器 | CodeMirror 6 | 6.x | 提示词编辑器 |
| UI 原语 | Radix UI | 1.x | 无样式可访问 UI 组件 |
| 图标 | Lucide React | 1.7 | SVG 图标库 |
| 包管理 | pnpm | 9 | 前端依赖管理 |
| 测试 | Vitest | 4.1 | 前端单元测试 |
| Lint | ESLint | 10.x | 代码质量 |
| 格式化 | Prettier | 3.8 | 代码风格 |

## 核心架构决策

### 1. Tauri 2 而非 Electron

选择 Tauri 2 的核心理由：
- **体积**：二进制 ~10MB vs Electron ~150MB
- **内存**：Rust 后端内存占用远低于 Chromium
- **安全**：CSP 限制 + Rust 侧路径校验，沙箱更严格
- **IPC 效率**：Tauri 的 `invoke` / `emit` / `Channel` 基于进程内通信，零网络开销

### 2. PTY 而非 WebSocket

直接用 `portable-pty` 创建伪终端而非通过 WebSocket 连接远程终端：
- **零延迟**：本地 PTY 文件描述符直读，无网络往返
- **完整 ANSI**：xterm.js 完整渲染 CLI TUI（进度条、颜色、鼠标交互）
- **跨平台**：`portable-pty` 封装了 Unix `forkpty` 和 Windows `ConPTY`

### 3. prop drilling 而非状态管理库

刻意不使用 Redux / Zustand 等外部状态库：
- 核心状态集中在 `App.tsx`，通过 props 向下传递
- Tauri 事件驱动异步状态更新
- 利弊权衡：简单透明，但大组件需注意渲染范围控制

### 4. 文件持久化而非数据库

使用 JSON 文件（`~/.nezha/`）而非 SQLite：
- 数据结构简单（Project[]、Task[]），无需关系查询
- 原子写入防崩溃损坏
- 用户可直接查看/编辑配置文件

## 文档索引

- [前后端通信机制](./frontend-backend-communication.md) — IPC 通道、事件总线、Channel 直投
- [终端系统设计](./terminal-system.md) — PTY 管理、批量写入、RAF 调度
- [Hook 事件系统](./hook-system.md) — Agent 生命周期监控、零轮询状态推送
- [Git 集成](./git-integration.md) — 完整 Git 操作、Worktree 管理、路径安全
- [会话自动发现](./session-discovery.md) — JSONL 监听、兜底提取、延迟绑定
- [构建与发布](./build-and-release.md) — CI/CD、多平台打包、版本一致性校验
- [性能优化模式](./performance-patterns.md) — RAF 批量、Channel 直投、缓冲区控制
- [跨平台策略](./cross-platform.md) — macOS Dock、Windows 窗口隐藏、locale 处理
