# BoxingCat — 基础框架选型与开发里程碑

> 基于对 GitHub 7 个仓库的 Clone + 源码分析后制定。
> 分析日期：2026-06-17

---

## 一、Clone 仓库总览

| 仓库 | ★ | 技术栈 | 核心模块 | 作为基础框架？ |
|------|---|--------|---------|:---:|
| **bongo-cat-next** | 124 | Tauri 2 + Next.js + Live2D | 猫猫渲染、动作控制、Live2D 管理 | 🥇 |
| **hiyori** | 3 | Tauri 2 + React 19 + PixiJS + Live2D | 极简 Live2D 桌面伴侣 | 🥈 结构模板 |
| **tauri-live2d** | 24 | Tauri 1 + Vue + PixiJS + Live2D | Live2D 桌面渲染 | 🔧 参考 |
| **clawd-on-desk** | 4396 | Electron + vanilla JS | 浮动窗口、Agent 监控、状态机、主题 | 📚 大量借鉴 |
| **oc-claw** | 292 | Tauri 2 + React + Rust | Agent 监控、Rust 后端 | 📚 后端借鉴 |
| **desktop-homunculus** | 77 | Bevy + Rust + VRM | 3D VRM 桌面角色 | 📚 渲染参考 |
| **MiniCPM-Desk-Pet** | 293 | Electron + llama.cpp | 本地 LLM 推理侧车 | 📚 AI 参考 |

---

## 二、基础框架决策

### 🏆 选定：bongo-cat-next（Tauri 2 + Live2D + TypeScript）

### 2.1 选择理由

```
bongo-cat-next 的技术栈与我们推荐方案的重合度：

Tauri 2 桌面壳      ✅ 完全匹配
Transparent 窗口    ✅ 已配置
TypeScript          ✅ 完全匹配
Live2D Web SDK      ✅ pixi-live2d-display 已集成
React 前端          ✅ Next.js（可降级为 Vite）
跨平台打包          ✅ NSIS/DMG 已配置
猫猫状态管理        ✅ cat-store 已实现
动作/表情控制       ✅ motion-selector 已实现
```

### 2.2 需要改造的地方

| 原版问题 | 改造方案 |
|---------|---------|
| Next.js SSR 框架（过重） | 降级为 Vite + React SPA（参考 hiyori） |
| 仅有猫猫渲染 | 补充摄像头、AI、飞盘、旅行等模块 |
| 无 Rust 后端逻辑 | 新增 PTY/AI/Git 等模块（借鉴 Nezha + oc-claw） |
| 无 Agent 监控 | 借鉴 clawd-on-desk 的状态机+Agent适配器 |
| 无区块链/账户 | 集成 AAStar SDK |

### 2.3 模块借鉴映射

```
我们的架构                    借鉴来源
─────────────────────────────────────────────
桌面透明窗口 + Live2D渲染  → bongo-cat-next (基础框架)
                              + hiyori (React 19 结构)

浮动窗口管理 + hit geometry → clawd-on-desk (main.js, floating-window-runtime.js, hit-geometry.js)
桌面宠物状态机              → clawd-on-desk (state.js, state-visual-resolver.js)
Agent 后端管理 (Rust)       → oc-claw + Nezha (pty.rs, hooks.rs)
IPC Channel 高频通信        → Nezha (Channel + RAF 批量)
AI 推理侧车                 → MiniCPM-Desk-Pet (llama.cpp sidecar 模式)
主题系统                    → clawd-on-desk (theme-runtime.js, theme-schema.js)
跨平台打包                  → bongo-cat-next + Nezha CI/CD
```

---

## 三、技术架构详图

```
BoxingCat/
├── src/                          # React 19 前端（借鉴 hiyori + bongo-cat-next）
│   ├── main.tsx                  # 入口
│   ├── App.tsx                   # 根组件（状态中心）
│   ├── components/
│   │   ├── cat/                  # 🐱 猫猫渲染（核心模块）
│   │   │   ├── CatViewer.tsx     # Live2D 渲染器（借鉴 bongo-cat-next）
│   │   │   ├── MotionController.tsx  # 动作控制
│   │   │   ├── ExpressionController.tsx # 表情控制
│   │   │   └── CatStateMachine.ts # 状态机（借鉴 clawd-on-desk state.js）
│   │   ├── fitness/             # 🥊 拳击健身
│   │   │   ├── CameraView.tsx   # 摄像头画面
│   │   │   ├── PoseOverlay.tsx  # 骨架叠加层
│   │   │   ├── ScoreBoard.tsx   # 实时评分
│   │   │   └── TrainingSession.tsx # 训练课程
│   │   ├── frisbee/             # 🥏 飞盘
│   │   │   ├── FrisbeeAnimation.tsx # 飞盘飞行
│   │   │   ├── FrisbeeCatch.tsx # 捕获动画
│   │   │   └── CatPoop.tsx      # 猫屎特效
│   │   ├── travel/              # ✈️ 旅行
│   │   │   ├── TravelNotification.tsx
│   │   │   └── TravelDiary.tsx
│   │   ├── settings/            # ⚙️ 设置
│   │   │   ├── AccountPanel.tsx # AAStar 账户
│   │   │   ├── CatSettings.tsx  # 猫猫设置
│   │   │   └── TrainingSettings.tsx
│   │   └── shared/              # 通用组件
│   │       ├── Toast.tsx
│   │       ├── Notification.tsx
│   │       └── IconButton.tsx
│   ├── hooks/
│   │   ├── useLive2D.ts         # Live2D 管理（借鉴 bongo-cat-next）
│   │   ├── usePoseDetection.ts  # MediaPipe 姿态检测
│   │   ├── useCamera.ts         # 摄像头管理
│   │   ├── useTraining.ts       # 训练状态
│   │   ├── useFrisbee.ts        # 飞盘逻辑
│   │   ├── useAccount.ts        # AAStar 账户
│   │   └── useIPCChannel.ts     # Tauri Channel（借鉴 Nezha）
│   ├── stores/                   # 状态（借鉴 bongo-cat-next cat-store）
│   │   ├── cat-store.ts
│   │   ├── fitness-store.ts
│   │   ├── frisbee-store.ts
│   │   └── account-store.ts
│   ├── types/                    # TypeScript 类型
│   │   ├── cat.ts
│   │   ├── fitness.ts
│   │   ├── frisbee.ts
│   │   └── account.ts
│   └── utils/
│       ├── live2d.ts            # Live2D 工具（借鉴 bongo-cat-next）
│       ├── pose-classifier.ts   # 拳击分类器（V1 代码迁移）
│       ├── score-engine.ts      # 评分引擎
│       └── frisbee-physics.ts   # 飞盘物理
│
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs                # Tauri 命令注册
│   │   ├── pty.rs                # PTY 管理（借鉴 Nezha）
│   │   ├── fitness.rs            # 健身/评分后端逻辑
│   │   ├── frisbee.rs            # 飞盘路由
│   │   ├── travel.rs             # 旅行随机引擎
│   │   ├── account.rs            # AAStar SDK 封装
│   │   ├── notification.rs       # 桌面通知
│   │   └── storage.rs            # 持久化（借鉴 Nezha atomic_write）
│   ├── Cargo.toml
│   └── tauri.conf.json           # 透明窗口配置
│
├── ai-models/                    # AI 模型（本地部署）
│   ├── pose_landmarker_lite.task # MediaPipe Pose 5.6MB
│   └── boxing_classifier.onnx    # 拳击分类器（进阶期）
│
├── assets/
│   └── cat/                      # Live2D 模型文件
│       ├── boxing_cat.model3.json
│       └── textures/
│
└── docs/                         # 设计文档
```

---

## 四、开发里程碑计划

### Phase 0：项目初始化（1 周）

```
Week 1: 基础框架搭建
```

| # | 任务 | 借鉴来源 | 产出 |
|---|------|---------|------|
| 0.1 | Clone bongo-cat-next，降级为 Vite + React SPA | bongo-cat-next + hiyori | 可运行的 Tauri 2 + Vite + React 19 + Live2D 骨架 |
| 0.2 | 配置透明窗口（macOS + Windows） | bongo-cat-next tauri.conf.json | 透明桌面宠物窗口 |
| 0.3 | 加载测试 Live2D 猫猫模型 | bongo-cat-next cat-viewer.tsx | 猫猫在桌面显示 |
| 0.4 | 集成 Tauri Channel IPC | Nezha useTerminalManager | Channel 通信通路 |
| 0.5 | CI/CD 流水线搭建 | Nezha GitHub Actions | 多平台自动构建 |

**里程碑 0 验收**：猫猫在 macOS + Windows 桌面显示，透明窗口正常，点击交互 OK。

---

### Phase 1：拳击健身 MVP（3 周）

```
Week 2-4: 核心差异化功能
```

| # | 任务 | 借鉴来源 | 产出 |
|---|------|---------|------|
| 1.1 | 摄像头集成 + MediaPipe Pose 加载 | V1 代码示例 | 摄像头画面 + 33 关键点可视化 |
| 1.2 | 规则引擎拳击分类器 | V1 pose-classifier 代码 | 直拳/勾拳/闪避 识别 |
| 1.3 | 实时评分引擎 | V1 score-engine 代码 | 姿势/力量/连贯性评分 |
| 1.4 | 训练会话管理 | clawd-on-desk state.js | 开始/暂停/结束训练 + 统计 |
| 1.5 | 猫粮 + 敏捷度结算 | — | 训练 → 猫粮/敏捷度产出 |
| 1.6 | 猫猫训练反馈动画 | bongo-cat-next MotionController | 训练时猫猫同步做动作 |

**里程碑 1 验收**：能打开摄像头，做拳击动作，实时看到骨架 + 评分，训练结束获得猫粮。

---

### Phase 2：账户 + NFT + 猫猫外观（2 周）

```
Week 5-6: 账户体系和猫猫个性化
```

| # | 任务 | 借鉴来源 | 产出 |
|---|------|---------|------|
| 2.1 | AAStar SDK 集成 (@aastar/sdk) | AAStarCommunity/aastar-sdk | 邮箱注册 + AA 钱包创建 |
| 2.2 | 主人账户管理面板 | — | 账户设置页 |
| 2.3 | 猫猫 Agent 账户派生 | — | Agent 账户自动生成 |
| 2.4 | NFT 外观系统 | — | NFT → 猫猫模型映射 |
| 2.5 | Live2D 模型切换 | bongo-cat-next model-store | 换皮肤/配饰 |
| 2.6 | 猫猫状态持久化 | Nezha storage.rs | 本地存储猫猫数据 |

**里程碑 2 验收**：邮箱注册 → 猫猫 Agent 账户创建 → 购买 NFT → 猫猫外观变化。

---

### Phase 3：飞盘社交（3 周）

```
Week 7-9: 异步社交玩法
```

| # | 任务 | 借鉴来源 | 产出 |
|---|------|---------|------|
| 3.1 | 飞盘购买/发射 UI | — | 飞盘道具系统 |
| 3.2 | 飞盘飞行动画（PixiJS 抛物线） | — | 飞盘从屏幕外飞入 |
| 3.3 | 捕获判定（敏捷度 vs 飞盘稀有度） | — | 敏捷度阈值匹配 |
| 3.4 | 捕获成功动画 | — | 猫猫跳跃接住 + 粒子特效 |
| 3.5 | 猫屎惩罚系统 | — | 失败动画 + 打扫消耗猫粮 |
| 3.6 | WS 中继服务器（Rust Axum） | — | 飞盘路由 + 在线状态 |

**里程碑 3 验收**：买飞盘 → 发射 → 飞到别人桌面 → 捕获/失败 → 猫粮结算。

---

### Phase 4：旅行系统（2 周）

```
Week 10-11: 异步养成体验
```

| # | 任务 | 借鉴来源 | 产出 |
|---|------|---------|------|
| 4.1 | 旅行触发/配置 | 旅行的青蛙参考 | 猫猫出门 UI |
| 4.2 | 随机事件引擎 (Rust) | — | 事件表 + 概率抽选 |
| 4.3 | 旅行计时器 + 桌面通知 | Nezha notification.rs | 归来推送 |
| 4.4 | 旅行日记/明信片 | — | 带回照片/消息 |
| 4.5 | 社交旅行（遇到其他猫） | WS 中继 | 旅行中遇到其他用户 |

**里程碑 4 验收**：猫猫自主出门 → 随机时间归来 → 带回物品/消息。

---

### Phase 5：打磨 + 发布（3 周）

```
Week 12-14: 体验打磨和正式发布
```

| # | 任务 | 借鉴来源 | 产出 |
|---|------|---------|------|
| 5.1 | 猫猫交互打磨（点击/拖拽/气泡） | clawd-on-desk pet-interaction | 完整的桌面交互 |
| 5.2 | 主题系统 | clawd-on-desk theme-runtime | 多种猫猫主题 |
| 5.3 | 性能优化（常驻 <5% CPU） | Nezha 性能模式 | 不拖慢电脑 |
| 5.4 | 平台兼容测试 | — | Win/Mac/Linux |
| 5.5 | 应用商店发布 | — | macOS DMG + Win NSIS |
| 5.6 | 官网 landing page | — | boxingcat.io |

**里程碑 5 验收**：正式发布 v1.0。

---

### Phase 6：广场系统（远期，不排期）

| # | 任务 | 说明 |
|---|------|------|
| 6.1 | 任务板（每日/每周挑战） | 社区驱动内容 |
| 6.2 | 兑换商店 | 猫粮换道具 |
| 6.3 | 排行榜 | 敏捷度/猫粮排名 |
| 6.4 | 社区入口 | Discord/Telegram 接入 |

---

## 五、各仓库可借鉴的具体模块

### 5.1 clawd-on-desk — 桌面宠物产品级参考

| 源文件 | 功能 | BoxingCat 对应模块 |
|--------|------|-------------------|
| `main.js` | Electron 主进程、浮动窗口 | Tauri 侧 main.rs |
| `floating-window-runtime.js` | 窗口浮动行为 | 猫猫窗口管理 |
| `hit-geometry.js` | 点击区域几何 | 猫猫点击检测 |
| `state.js` | 宠物状态机 | CatStateMachine.ts |
| `state-visual-resolver.js` | 状态→动画映射 | MotionController.tsx |
| `pet-window-runtime.js` | 宠物窗口运行时 | CatViewer 生命周期 |
| `drag-position.js` | 拖拽定位 | 猫猫拖拽 |
| `animation-cycle.js` | 动画循环 | useLive2D hook |
| `theme-runtime.js` | 主题系统 | 猫猫皮肤 |
| `mac-window.js` | macOS 窗口特效 | macOS 特定 |

### 5.2 bongo-cat-next — Live2D 管理最佳实践

| 源文件 | 功能 | BoxingCat 对应模块 |
|--------|------|-------------------|
| `src/components/cat-viewer.tsx` | Live2D 渲染器 | CatViewer.tsx |
| `src/components/motion-selector.tsx` | 动作控制 | MotionController.tsx |
| `src/components/expression-selector.tsx` | 表情控制 | ExpressionController.tsx |
| `src/hooks/use-live2d-system.ts` | Live2D 系统管理 | useLive2D.ts |
| `src/stores/cat-store.ts` | 猫猫状态管理 | cat-store.ts |
| `src/stores/model-store.ts` | Live2D 模型管理 | model loader |
| `src/utils/live2d.ts` | Live2D 工具函数 | 直接复用 |
| `src/utils/path.ts` | 路径处理 | 直接复用 |
| `src-tauri/tauri.conf.json` | 透明窗口配置 | 直接参考 |

### 5.3 hiyori — React 19 + PixiJS 结构模板

| 源文件 | 功能 | BoxingCat 对应模块 |
|--------|------|-------------------|
| `package.json` | 依赖清单 | 直接参考（pixi-live2d-display 0.4.0） |
| `src-tauri/tauri.conf.json` | Tauri 2 透明窗口 | macOSPrivateApi + transparent |

### 5.4 oc-claw — Rust 后端参考

| 源文件 | 功能 | BoxingCat 对应模块 |
|--------|------|-------------------|
| `src-tauri/` | Tauri 2 Rust 结构 | Rust 命令组织 |
| `frontend/src/` | React 前端 | 组件结构 |

### 5.5 Nezha — IPC + 性能最佳实践

| 模块 | 功能 | BoxingCat 对应模块 |
|------|------|-------------------|
| `pty.rs` | PTY + Channel 反压 | Agent 管理 |
| `hooks.rs` | Agent 事件注入 | 训练事件上报 |
| `event_watcher.rs` | 文件事件监听 | 训练状态监控 |
| `useTerminalManager.ts` | RAF 批量消费 | AI 输出消费 |
| `storage.rs` | 原子写入 | 本地持久化 |
| CI/CD | 多平台构建 | 发布流水线 |

---

## 六、关键技术依赖清单

```
生产依赖：
  @tauri-apps/api ^2.10          # Tauri 2 前端 API
  pixi.js ^6.5                    # 2D 渲染引擎
  pixi-live2d-display ^0.5        # Live2D Web 渲染
  @mediapipe/tasks-vision latest  # 姿态检测
  @aastar/sdk latest              # AAStar 账户
  react ^19                       # UI 框架
  react-dom ^19                   # UI 框架
  zustand (或内置 store)          # 状态管理
  gsap                            # 动画引擎（飞盘/特效）

开发依赖：
  @tauri-apps/cli ^2              # Tauri CLI
  vite ^6                         # 构建工具
  typescript ^5                   # 类型检查
  vitest                          # 测试框架

Rust 依赖：
  tauri 2                         # 桌面框架
  tokio                           # 异步运行时
  serde / serde_json              # 序列化
  reqwest (http客户端)            # AAStar API / WS
  parking_lot                     # 高性能 Mutex
```

---

## 七、风险与应对

| 风险 | 应对 |
|------|------|
| bongo-cat-next 许可证（检查是否有 LICENSE） | 先检查，必要时联系作者或重新实现核心逻辑 |
| Live2D SDK 商业授权 | MVP 用免费模型测试，确认可行后购买授权 |
| MediaPipe WASM 在 Tauri WebView 兼容性 | POC Phase 0 即验证 |
| AAStar SDK 成熟度 | Phase 2 前做专项 POC |
| WS 中继服务器成本 | Phase 3 评估，MVP 可纯本地 |
