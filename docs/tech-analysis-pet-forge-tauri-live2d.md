# BoxingCat 技术方案分析

> 分析日期: 2026-06-19 | 分析对象: pet-forge (rullerzhou-afk) + tauri-live2d (itxve)

---

## 一、两个参考仓库的定位

| | **pet-forge** | **tauri-live2d** |
|---|---|---|
| **本质** | Claude Code **Skill** — 动画资产创作工具包 | Tauri 桌面应用 — Live2D 模型**运行时** |
| **解决的问题** | "怎么做桌宠动画？" → 提供完整工作流 | "怎么在桌面跑 Live2D？" → 提供渲染容器 |
| **产出物** | `.svg.html` 或 `.apng` 文件 | 可运行的桌面 App |
| **核心用户** | AI coding agent（Claude Code / Codex） | 终端用户 |
| **对标 BoxingCat** | → 动画生产管线（怎么做出好看的猫） | → 运行时架构（怎么让猫活在桌面上） |

**关键洞察**：pet-forge 是"怎么做动画"，tauri-live2d 是"怎么运行动画"。BoxingCat 需要的是：**用 pet-forge 的方法论做动画，用 tauri-live2d 的架构跑动画**。

---

## 二、pet-forge 核心方法论

### 2.1 动画哲学：SVG 优先

```
参考图 → 去背景 → PNG 转 SVG → 套 preset + 模板 → CSS 动画迭代
```

**核心优势**：
- **零 API 费用**：纯本地矢量工作流，不依赖任何付费生成 API
- **自包含**：每个 `.svg.html` 文件 = HTML + CSS + JS，双击即跑，零外部依赖
- **CSS 变量驱动**：节奏档位全部抽成 `--breath-period`、`--blink-min-gap` 等 CSS 变量，调整不碰动画代码
- **热改友好**：浏览器开着，改 SVG 刷新即看，迭代周期秒级
- **体积极小**：SVG 目标 < 100KB，状态切换零延迟

### 2.2 两条路线对比

| 维度 | SVG 路线 | APNG 路线 |
|------|---------|----------|
| 费用 | 免费（本地工具） | 需付费/免费生成 API |
| 控制力 | 高，每帧可编辑 | 低，重跑正常 |
| 循环精度 | CSS 精确循环 | 需首尾帧锚定 |
| 文件大小 | 通常 < 100KB | 通常数百 KB 起 |
| 适合场景 | 精致矢量宠物、精确循环 | 丰富视觉风格、快速出稿 |
| 推荐人群 | 能写 CSS 的开发者 | 追求速度、预算充足的用户 |

**BoxingCat 选择 SVG 路线**：BoxingCat 需要精准循环 + 小体积 + 可热改 + 零费用。

### 2.3 状态机设计（25 状态 + A/B/C 分类）⭐

pet-forge 最核心的资产是 25 状态分类系统，每个状态属于三种类型之一：

#### A 型 — 循环（loop:true，首=尾）

```
idle-dozing        待机呼吸
idle-living        空闲小动作
thinking           思考
working-typing     工作-打字
working-building   工作-建造
working-juggling   工作-玩耍(1个 subagent)
working-conducting 工作-指挥(2+ subagent)
working-sweeping   工作-擦扫(context 压缩)
working-carrying   工作-搬运(worktree 创建)
sleeping           睡觉
error              XX眼晕倒
react-drag         被拖动(悬浮循环)
mini-idle          mini 待机
mini-alert         mini 通知
mini-happy         mini 完成
mini-sleep         mini 休眠
```

#### B 型 — 一次性回归（loop:false，首=尾，做完回原姿）

```
happy              任务完成
notification       通知/警觉
idle-yawn          打哈欠(长闲触发)
idle-look          四处张望
react-poke         被戳反应
mini-peek          mini 探头
```

#### C 型 — 过渡桥梁（loop:false，首≠尾）⚠️ 关键！

```
collapse-sleep     坐倒入睡 (idle→sleep)
wake               醒来 (sleep→idle)
mini-enter         mini 入场 (场外→mini)
```

**技术含义**：
- A 型 → CSS `@keyframes` 0% = 100%，`animation: infinite`
- B 型 → CSS `animation: 1 forwards`，结束后回到 `idle`
- C 型 → CSS `animation: 1 forwards`，`animation-fill-mode: forwards`，结束后保持在末帧

#### 衔接链示例

```
正常睡眠链:
  idle (A) → idle-yawn (B) → idle-dozing (A) → collapse-sleep (C) ← 过渡桥梁
   → sleeping (A) → wake (C) ← 过渡桥梁 → idle (A)

mini 入场链:
  idle (A) → mini-enter (C) ← 过渡桥梁 → mini-idle (A)
```

### 2.4 Agent Event → 状态映射表

这是"AI 桌宠"区别于"普通桌宠"的核心——桌宠的动画状态不是随机的，而是**由 AI Agent 的行为事件驱动**：

| Agent Event | 对应状态 | 说明 |
|---|---|---|
| Idle (no activity) | `idle` | 默认状态 |
| Idle (random, long) | `idle-yawn` / `idle-look` | 长时间 idle 触发的彩蛋 |
| UserPromptSubmit | `thinking` | 用户发了消息 |
| PreToolUse / PostToolUse | `typing` | 单次工具使用 |
| PreToolUse (3+ sessions) | `building` | 频繁工具使用 |
| SubagentStart (1) | `juggling` | 起 1 个 subagent |
| SubagentStart (2+) | `conducting` | 起多个 subagent |
| PostToolUseFailure | `error` | 工具失败 |
| Stop / PostCompact | `happy` | 任务完成 |
| PermissionRequest | `notification` | 等待用户授权 |
| PreCompact | `sweeping` | 上下文压缩中 |
| WorktreeCreate | `carrying` | 创建 worktree |
| 60s no events | `sleeping` | 长期空闲 |

### 2.5 标准接口（接桌宠运行时）

一个 theme 至少要提供这些状态文件：

```json
{
  "name": "boxing-cat",
  "states": {
    "idle": "states/idle.svg.html",
    "typing": "states/typing.svg.html",
    "thinking": "states/thinking.svg.html",
    "sleeping": "states/sleeping.svg.html",
    "happy": "states/happy.svg.html",
    "error": "states/error.svg.html",
    "notification": "states/notification.svg.html",
    "carrying": "states/carrying.svg.html",
    "building": "states/building.svg.html",
    "juggling": "states/juggling.svg.html",
    "conducting": "states/conducting.svg.html",
    "sweeping": "states/sweeping.svg.html"
  },
  "mini": {
    "idle": "states/mini-idle.svg.html",
    "enter": "states/mini-enter.svg.html",
    "peek": "states/mini-peek.svg.html",
    "alert": "states/mini-alert.svg.html",
    "happy": "states/mini-happy.svg.html",
    "sleep": "states/mini-sleep.svg.html"
  },
  "reactions": {
    "drag": "states/react-drag.svg.html",
    "poke": "states/react-poke.svg.html"
  }
}
```

### 2.6 最小可上线集合

```
必做 5 个:   idle, typing, thinking, sleeping, happy
建议 3 个:   notification, error, carrying
高级 5 个:   building, juggling, conducting, sweeping, react-drag
Mini 6 个:   mini-idle, mini-enter, mini-peek, mini-alert, mini-happy, mini-sleep
```

### 2.7 关键设计原则

1. **不要一上来铺 21 状态**：先做 1 个 hero 状态磨到位
2. **改前先备份**：cp 一份 `-backup-YYYY-MM-DD`
3. **跑偏方向归档不删**：`_archive/` 留追溯
4. **浏览器循环看 30s+**：静帧好看 ≠ 循环好看
5. **角色一致性是工程问题**：library/ 资产钉死锚点
6. **状态命名保持通用**：用 `idle / typing / thinking` 不要发明新命名
7. **每个状态文件大小控制**：SVG < 100KB，否则切换卡
8. **不要为每个事件都做独立动画**：合理复用

---

## 三、tauri-live2d 核心架构

### 3.1 窗口策略

```
┌─────────────────────────────────────┐
│  main 窗口 (live2d.html)            │
│  ├─ transparent: true               │  ← 透明背景（关键！）
│  ├─ decorations: false              │  ← 无边框
│  ├─ alwaysOnTop: true               │  ← 桌面悬浮
│  ├─ skipTaskbar: true               │  ← 不占任务栏
│  ├─ resizable: false                │  ← 默认固定大小
│  └─ 215x200 → 可切换为可缩放模式    │
├─────────────────────────────────────┤
│  config 窗口 (index.html)           │
│  └─ 独立 WebviewWindow，按需显示     │  ← 配置面板单独窗口
└─────────────────────────────────────┘
```

**BoxingCat 已具备同款窗口配置**（`tauri.conf.json` 已配 transparent/decorations/alwaysOnTop/skipTaskbar），可以直接复用双窗口模式。

### 3.2 渲染管线

```
┌──────────────────────────────────────┐
│  前端 (Vue 3 + TypeScript)           │
│  ├─ PixiJS Application               │  ← WebGL 渲染层
│  │   └─ Live2DModel.from(url)        │  ← 模型加载
│  │       ├─ .on("hit") → motion()    │  ← 点击区域交互
│  │       ├─ .on("pointerdown") → drag│  ← 拖拽重定位
│  │       └─ scale/position set       │  ← 配置恢复
│  └─ HTML Canvas (#live2d)            │
├──────────────────────────────────────┤
│  后端 (Rust)                         │
│  ├─ web_server (axum)                │  ← 本地 HTTP 文件服务
│  │   ├─ ServeDir(model_dir)          │  ← 静态文件 serve
│  │   └─ WebSocket (/ws)              │  ← 预留实时通信
│  ├─ commands                         │
│  │   ├─ model_list() — glob 扫描     │  ← 模型自动发现
│  │   ├─ read_config/write_config     │  ← 配置持久化
│  │   └─ read_file/write_file         │  ← 通用文件 I/O
│  └─ plugins                         │
│      ├─ autostart (auto-launch)      │  ← 开机自启
│      └─ checkupdate (updater)        │  ← 自动更新
└──────────────────────────────────────┘
```

### 3.3 配置管理（Rust 侧，可直接移植）

```rust
// 核心模式：read → amend → write
pub struct AppConf {
    pub port: u16,           // web_server 端口
    pub model_dir: String,   // 模型目录
    pub width: u16,          // 窗口宽
    pub height: u16,         // 窗口高
    pub x: u16,              // 窗口 X
    pub y: u16,              // 窗口 Y
    pub check_update: bool,  // 是否检查更新
    pub remote_list: Vec<String>, // 远端模型列表
    pub model_block: bool,   // 模型块状态
    pub auto_start: bool,    // 开机自启
}

// 使用方式
AppConf::read()                        // 从磁盘读取
  .amend(serde_json::json!({"x": 100})) // 合并字段（BTreeMap merge）
  .write()                             // 写回磁盘
```

**特点**：字段级合并（非全量替换），配置路径 `~/.live2d/live2d.conf.json`。

### 3.4 模型/资产管理

- **本地模型**：内嵌 axum 随机端口 serve `model_dir` 目录
- **远端模型**：直接 URL 加载（CDN / 自定义 URL）
- **模型自动发现**：`glob("{model_dir}/**/*.model3.json")` + `glob("**/index.json")`
- **随机切换**：`nextModel()` 从扫描列表随机选一个模型

### 3.5 用户交互

- **拖拽移动**：PixiJS pointerdown/pointermove 事件，坐标实时写配置
- **点击互动**：Live2D hit area 检测 → `model.motion("tap_body")`
- **缩放**：Shift + 加减号 → `model.scale.set(x ± 0.01, y ± 0.01)`
- **鼠标穿透**：`setIgnoreCursorEvents(true)` — 点击透过桌宠到下方应用
- **窗口缩放**：切换到可缩放模式 → 拖拽边框调整大小
- **模型块背景**：半透明白色背景辅助检查模型边界

### 3.6 技术债务（作者自述）

- CPU 使用率高（PixiJS + Live2D WebGL 渲染）
- macOS 下出现窗口虚线（透明窗口渲染 bug）
- 代码结构散乱（一次性的探索项目）

---

## 四、对 BoxingCat 的具体建议

### 4.1 技术路线：SVG 优先 + 运行时无关

```
                  pet-forge 工作流
                       │
┌──────────────────────┼──────────────────────┐
│  PNG 参考图          │                      │
│  → rembg 去背景     │                      │
│  → vtracer 转 SVG   │                      │
│  → 套 CSS preset    │                      │
│  → 浏览器迭代打磨   │                      │
│  → 产出 .svg.html   │                      │
└──────────────────────┼──────────────────────┘
                       ▼
              BoxingCat Runtime
         ┌─────────────────────┐
         │  Tauri 透明窗口      │
         │  ├─ WebView 加载 SVG │
         │  ├─ 状态机控制器      │
         │  └─ Agent Event Bridge│
         └─────────────────────┘
```

**选择 SVG 而非 Live2D/PixiJS 的理由**：

1. **CPU 占用低**：CSS animation 由浏览器引擎 GPU 加速，tauri-live2d 作者自己也说 PixiJS + Live2D CPU 占用高
2. **自重小**：SVG < 100KB 目标，切换零延迟
3. **可热改**：浏览器 F5 即看，不重新编译
4. **零依赖**：不引入 pixi.js (2MB+)、pixi-live2d-display、Live2D Cubism SDK
5. **方法论对齐**：直接使用 pet-forge 的完整工作流和模板
6. **角色自定义**：不依赖第三方 Live2D 模型，完全原创

### 4.2 架构分层建议

```
BoxingCat/
├── src/
│   ├── runtime/              ← 桌宠运行时（借鉴 tauri-live2d）
│   │   ├── window.ts         ← 窗口管理（双窗口模式）
│   │   ├── state-machine.ts  ← 状态机（借鉴 pet-forge 25-state A/B/C 模型）
│   │   ├── event-bridge.ts   ← Agent Event → State 映射
│   │   └── loader.ts         ← SVG/APNG 状态文件加载器
│   ├── assets/               ← 动画资产（借鉴 pet-forge 模板）
│   │   ├── presets/          ← CSS 变量预设（apple-precise, pixel-art...）
│   │   ├── templates/        ← hello-idle 等 starter 模板
│   │   └── states/           ← idle.svg.html, typing.svg.html, ...
│   ├── components/           ← React 组件
│   │   ├── PetView.tsx       ← 桌宠显示容器
│   │   └── ConfigPanel.tsx   ← 配置面板
│   └── hooks/
│       ├── useStateMachine.ts ← 状态机 hook
│       └── useAgentEvents.ts  ← Agent 事件监听 hook
├── src-tauri/
│   ├── src/
│   │   ├── config.rs         ← AppConf（移植 tauri-live2d 模式）
│   │   ├── commands.rs       ← Tauri commands
│   │   └── lib.rs
│   └── web_server/           ← 可选：本地文件 serve
└── docs/
    └── tech-analysis-pet-forge-tauri-live2d.md  ← 本文档
```

### 4.3 状态机接口设计

```typescript
// 状态类型（来自 pet-forge）
type StateType = 'A' | 'B' | 'C'; // A=循环 B=回归 C=过渡

// 状态定义
interface PetState {
  id: string;           // e.g. "idle", "thinking", "sleeping"
  type: StateType;
  file: string;         // e.g. "states/idle.svg.html"
  duration?: number;    // B/C 型动画时长 ms
  next?: string;        // 回归/过渡到的状态
}

// Agent 事件
interface AgentEvent {
  type: 'thinking' | 'typing' | 'building' | 'juggling'
      | 'conducting' | 'sweeping' | 'carrying'
      | 'happy' | 'error' | 'notification' | 'sleeping'
      | 'idle';
  metadata?: Record<string, unknown>;
}

// 状态机
class StateMachine {
  private current: PetState;
  private states: Map<string, PetState>;
  private eventMap: Map<string, string>; // event → state

  transition(event: AgentEvent): void;
  getFile(): string;
}
```

### 4.4 MVP 路线图

#### Phase 0（当前）：验证 SVG 方案

- [x] 写技术分析文档
- [x] 克隆 13 个参考仓库
- [ ] 搜索白色德文猫 PNG 参考图
- [ ] PNG → SVG 转换（pet-forge png2svg 流程）
- [ ] 套 hello-idle 模板，让猫呼吸 + 眨眼
- [ ] 在 Tauri 透明窗口中加载，验证端到端可行

#### Phase 1：hello-idle MVP

- [ ] 打磨 idle 状态到满意（循环看 30s+ 不腻）
- [ ] 建立分层母版（layered-master convention）
- [ ] 移植 tauri-live2d 的 AppConf 配置系统到 Rust
- [ ] 实现状态机核心（idle → thinking → typing 循环）
- [ ] 在 Tauri 窗口跑通状态切换

#### Phase 2：核心状态扩展

- [ ] 完成 5 个必做状态：idle, typing, thinking, sleeping, happy
- [ ] 实现 Agent Event Bridge（监听 Claude Code 文件事件）
- [ ] 完成系统托盘 + 右鍵菜单
- [ ] 窗口拖拽 + 位置记忆

#### Phase 3：功能完善

- [ ] 建议状态 3 个：notification, error, carrying
- [ ] 配置面板（模型选择、预设切换、大小调整）
- [ ] 开机自启
- [ ] 自动更新

---

## 五、参考仓库完整清单

| # | 仓库 | 方向 | 关键借鉴 |
|---|------|------|---------|
| ⭐ | **rullerzhou-afk/pet-forge** | AI 动画 Skill | 状态机、SVG 工作流、Agent Event Map |
| ⭐ | **itxve/tauri-live2d** | Tauri + Live2D | 窗口架构、配置系统、web_server |
| 3 | Carliber/claude-pet | 像素宠 | Claude Code 监听、养成系统 |
| 4 | Rosa134/daidai-live2d-pet | Live2D + AI | 状态桥协议、TTS 口型同步 |
| 5 | jnMetaCode/codepet | 桌宠养成 | Claude Code 事件驱动升级 |
| 6 | ChaozhongLiu/DyberPet | PySide6 框架 | MOD 系统、任务/商店设计 |
| 7 | HELPMEEADICE/BANDORI-PET-REV | LuaJIT Live2D | 自研渲染引擎、角色扮演系统 |
| 8 | rullerzhou-afk/clawd-on-desk | AI Agent 监控 | 14 种 agent 监听、权限气泡 |
| 9 | OpenBMB/MiniCPM-Desk-Pet | ML 驱动 | AI 模型集成桌宠 |
| 10 | liwenka1/bongo-cat-next | Bongo Cat | 简约桌宠实现 |
| 11 | not-elm/desktop-homunculus | 桌宠 | 基础桌宠架构 |
| 12 | devjiro76/hiyori | 桌宠 | 基础桌宠架构 |
| 13 | rainnoon/oc-claw | 桌宠 | 基础桌宠架构 |

---

## 六、总结

| 维度 | pet-forge 贡献 | tauri-live2d 贡献 | BoxingCat 怎么做 |
|------|---------------|-------------------|-----------------|
| **动画系统** | 25 状态 A/B/C 模型 + SVG 工作流 | PixiJS + Live2D 渲染 | **采用 SVG 路线**（更轻、更可控） |
| **状态机** | Agent Event → State 映射表 | 无（纯随机切换） | **继承映射表 + 扩展** |
| **窗口管理** | 无（纯文件产出） | 透明窗 + 双窗口 + 系统托盘 | **照搬双窗口模式** |
| **配置系统** | 无 | AppConf read/amend/write | **移植 Rust 配置模式** |
| **模型/资产管理** | png2svg 矢量化工具 | 本地 web_server + glob 发现 | **pet-forge 流程产资产 + 直接文件加载** |
| **性能** | SVG < 100KB，CPU≈0 | Live2D 吃 CPU（作者自述） | **SVG 路径胜出** |

**一句话**：架构抄 tauri-live2d，动画抄 pet-forge，事件桥自己做。
