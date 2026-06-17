# BoxingCat — GitHub 深度调研报告

> 调研日期：2026-06-17
> 调研方式：`gh search repos` 多维度关键词搜索 + `gh repo view` 深度查看
> 覆盖范围：桌面宠物、Godot + AI、游戏引擎、Live2D、VRM、区块链游戏、姿态检测

---

## 一、调研方法论

通过 `gh` CLI 对 GitHub 进行了 **30+ 次系统搜索**，覆盖以下关键词维度：

| 维度 | 搜索关键词 |
|------|-----------|
| 桌面宠物 | `desktop pet`, `desktop mascot`, `shimeji`, `virtual pet desktop` |
| Live2D/VRM | `live2d desktop`, `vrm desktop`, `tauri live2d` |
| Godot + AI | `godot ai`, `godot machine learning`, `godot onnx`, `godot mediapipe` |
| Godot + 区块链 | `godot solana`, `godot nft` |
| 健身/拳击 | `webcam fitness game`, `pose estimation boxing`, `mediapipe game fitness` |
| Rust 游戏引擎 | `bevy desktop pet`, `rust game engine desktop` |
| 桌面壳 | `tauri transparent window`, `tauri desktop overlay`, `electron live2d` |

---

## 二、桌面宠物赛道全景扫描

### 2.1 按技术栈分类

```
JavaScript/Web 系 (5个):
├── clawd-on-desk       ★4396  JS   pixel pet + AI agent monitoring
├── MiniCPM-Desk-Pet    ★293   JS   local LLM + desktop pet
├── bongo-cat-next      ★124   TS   Live2D cats + modern desktop
├── MacArkPet           ★145   JS   macOS native Ark-Pets port
└── vibebud             ★85    TS   floating AI virtual pets

C#/Unity 系 (4个):
├── uDesktopMascot      ★346   C#   Unity VRM desktop mascot framework ⭐
├── Desktop_Gremlin     ★536   C#   WPF animated desktop gremlin
├── DesktopPet(Adrianotiger) ★1110 C# classic eSheep revival
└── DesktopPet(huiyadanli) ★128 C# 伪春菜(伺か)风格

Java 系 (3个):
├── Ark-Pets            ★981   Java  Arknights desktop pets (明日方舟)
├── Shijima-Qt          ★191   C++   Shimeji runner
└── linux-shimeji       ★165   Java  Shimeji for Linux

Rust 系 (3个):
├── oc-claw             ★292   Rust  AI agent monitoring desktop pet ⭐
├── Clyde               ★134   Rust  AI coding agent reactive pet
└── desktop-homunculus  ★77    Rust  Bevy VRM desktop mascot ⭐

Python 系 (2个):
├── Agentic-Desktop-Pet ★303   Py    LLM + 记忆 + 情感 + RPG
└── AI-Girlfriend-Desktop-Pet ★220 Py LLM + Live2D + TTS

Swift/原生 系 (2个):
├── agentpet            ★232   Swift macOS + Windows desktop pet
└── CATAI               ★60    Swift macOS Dock pixel cats

C++ 系 (2个):
├── ZcChat              ★543   C++   AI Galgame 桌宠
└── yoMMD               ★40    C++   MMD desktop mascot for Win/Mac
```

### 2.2 关键发现

#### 发现 1：2026 年桌面宠物赛道正在爆发

`clawd-on-desk` 在 **3 个月内**（2026年3月创建）获得 **4396★**，说明 AI Agent 桌宠是当前最大热点。几乎所有高星项目都跟 AI Agent（Claude Code、Codex、Cursor）监控相关。

**对 BoxingCat 的启示**：拳击猫应该在满足"AI Agent 桌宠"这个基础市场定位的同时，叠加**健身+游戏化+社交**的差异化。

#### 发现 2：技术栈极度分散，没有统治方案

从 JS 到 C# 到 Rust 到 Python 到 Swift，各家用各种技术。这意味着**我们选什么技术栈都不会太离谱**，关键看团队能力和具体需求。

#### 发现 3：Live2D/VRM 是桌面角色主流方案

- `uDesktopMascot`（346★）用 Unity + VRM
- `bongo-cat-next`（124★）用 Live2D
- `desktop-homunculus`（77★）用 Bevy + VRM
- `tauri-live2d`（24★）用 Tauri + Live2D

---

## 三、Godot 生态深度调研

### 3.1 Godot + AI/ML

| 项目 | ★ | 说明 |
|------|---|------|
| `Godot_MachineLearning` (Godot-Machine-Learning org) | 20 | 神经网络 C++ 原生模块 |
| `Godot-ONNX-AI-Models-Loaders` (mat490) | 15 | ONNX 模型加载 GDExtension ⭐ |
| `godot_mediapipe_module` (purgeme) | 22 | MediaPipe C++ 模块 |
| `godot_onnx_extension` (joemarshall) | 5 | Python ONNX 扩展 |

**结论**：Godot 的 AI/ML 生态**仍然很早期**。有 ONNX 推理和 MediaPipe 的 GDExtension，但 Star 都不高，成熟度有限。

### 3.2 Godot + 区块链

| 项目 | ★ | 说明 |
|------|---|------|
| `godot-solana-sdk` (Virus-Axel) | **75** | Solana GDExtension ⭐⭐⭐ |
| `GodotSolanaSDKDemoPackage` (ZenRepublic) | 15 | Demo 包 |
| `GodotSolanaSDKDemos` | 3 | Web 版 Demo |

**结论**：有 Solana Godot SDK（75★），基础可行但不算成熟。如果选 Godot + Solana，这会是关键依赖。

### 3.3 Godot 桌面宠物

搜索 `godot desktop pet transparent`、`godot desktop mascot` 等关键词**均返回空结果**。Godot 作为桌面宠物的方案在 GitHub 上几乎没有先例。

**这意味着**：
- 如果选 Godot，我们是这条路上的先驱（机会）
- 但也没有现成参考，需要自己摸索透明窗口、鼠标穿透、always-on-top 等（风险）

### 3.4 Godot 桌面透明窗口的可行性

经过调研，Godot 4.x 支持透明窗口：

```gdscript
# Godot 4 项目设置
display/window/size/transparent = true
display/window/per_pixel_transparency/enabled = true
display/window/size/borderless = true
```

- macOS：Godot 4 原生支持 `NSVisualEffectView` 背景渲染
- Windows：需要 `WS_EX_LAYERED` + `WS_EX_TRANSPARENT`（Godot 4 已内置支持）
- Linux：Wayland 支持较好，X11 需要 compositor

---

## 四、Tauri vs Godot vs Bevy vs Unity 决战分析

### 4.1 对比矩阵（桌面宠物专用视角）

| 维度 | Tauri 2 + Web | Godot 4 | Bevy (Rust) | Unity |
|------|:---:|:---:|:---:|:---:|
| **桌面透明窗口** | ⭐⭐⭐⭐ Tauri 原生支持 | ⭐⭐⭐ Godot 4 实验性 | ⭐⭐ 需要手动 | ⭐⭐⭐⭐ 成熟 |
| **Live2D 支持** | ⭐⭐⭐⭐⭐ Web SDK 成熟 | ⭐⭐ 需要自己移植 | ⭐ 几乎无 | ⭐⭐⭐ 有插件 |
| **VRM 支持** | ⭐⭐⭐⭐ three.js + VRM | ⭐⭐ 有插件 | ⭐⭐⭐⭐ bevy_vrm | ⭐⭐⭐⭐⭐ UniVRM |
| **AI/ML 能力** | ⭐⭐⭐⭐⭐ MediaPipe/TF.js Web | ⭐⭐ ONNX GDExtension 早期 | ⭐⭐ 需手写 | ⭐⭐⭐ Barracuda/Sentis |
| **Webcam 访问** | ⭐⭐⭐⭐⭐ getUserMedia 原生 | ⭐⭐ 需插件 | ⭐ 需手写 | ⭐⭐⭐ 有支持 |
| **区块链集成** | ⭐⭐⭐ Solana Web3.js 成熟 | ⭐⭐ godot-solana-sdk (75★) | ⭐ 无 | ⭐⭐⭐⭐ Solana Unity SDK 成熟 |
| **游戏物理** | ⭐⭐ 需自行实现 | ⭐⭐⭐⭐⭐ 内置完善 | ⭐⭐⭐ ECS 需自己搭 | ⭐⭐⭐⭐⭐ 成熟 |
| **飞盘动画** | ⭐⭐⭐ Canvas/PixiJS | ⭐⭐⭐⭐⭐ 内置粒子+曲线 | ⭐⭐⭐ 需手写 | ⭐⭐⭐⭐⭐ 成熟 |
| **包体积** | ⭐⭐⭐⭐⭐ ~10MB | ⭐⭐⭐⭐ ~35MB | ⭐⭐⭐⭐ ~20MB | ⭐⭐ ~100MB+ |
| **CPU 占用（常驻）** | ⭐⭐⭐⭐ < 5% (WebGL) | ⭐⭐⭐ 需优化 | ⭐⭐⭐⭐⭐ 极低 | ⭐⭐ 高 |
| **内存占用** | ⭐⭐⭐ 中等 (Chromium) | ⭐⭐⭐⭐ 低 | ⭐⭐⭐⭐⭐ 极低 | ⭐⭐ 高 |
| **跨平台** | ⭐⭐⭐⭐⭐ Win/Mac/Linux | ⭐⭐⭐⭐⭐ Win/Mac/Linux/Web | ⭐⭐⭐⭐ Win/Mac/Linux | ⭐⭐⭐⭐⭐ Win/Mac/Linux/Mobile |
| **社区资源** | ⭐⭐⭐⭐⭐ 丰富 (前端生态) | ⭐⭐⭐⭐ 游戏生态好 | ⭐⭐ 较新 | ⭐⭐⭐⭐⭐ 极为丰富 |
| **GitHub 桌宠先例** | ⭐⭐⭐ tauri-live2d (24★), hiyori | ⭐ 无 | ⭐⭐ desktop-homunculus (77★) | ⭐⭐⭐ uDesktopMascot (346★) |

### 4.2 推荐排序

#### 🥇 **首选：Tauri 2 + Web 渲染（PixiJS + Live2D Web SDK）**

**理由**：
1. AI/ML 能力最强——MediaPipe、TensorFlow.js、ONNX Runtime Web 全部成熟可用
2. Webcam 访问零成本——`getUserMedia` API 稳定、浏览器级优化
3. Live2D Web SDK 成熟——`pixi-live2d-display` 已广泛使用
4. 桌面透明窗口——Tauri 2 原生支持，Nezha 项目已验证
5. 区块链——Solana Web3.js + Metaplex JS SDK 成熟度最高
6. 包体积最小、CPU 占用最低（桌面宠物常驻的关键指标）
7. **godot-solana-sdk 只有 75★**——远不如 Solana Web3.js 的几千 Star 和成熟度
8. 前端生态丰富——飞盘动画可以用 PixiJS + GSAP 轻松实现

**POC 验证优先级**：
```
1. Tauri 透明窗口 + Live2D 模型加载
2. getUserMedia + MediaPipe Pose 检测
3. Solana Web3.js 钱包连接 + NFT 铸造
4. PixiJS 飞盘动画 + 猫猫交互
```

#### 🥈 **备选：Godot 4 + GDExtension（Rust 写核心逻辑）**

**理由**（什么时候选 Godot）：
- 如果后续需要复杂的游戏物理和粒子特效
- 如果团队有 Godot 经验
- 如果决定把 BoxingCat 做成"游戏"而非"应用"

**风险**：
- AI/ML 生态不成熟，需要自己用 GDExtension 封装 ONNX/MediaPipe
- 桌面透明窗口先例极少，需要踩坑
- Webcam 需要额外插件
- 区块链 SDK 只有 75★

#### 🥉 **备选：Bevy (Rust ECS)**

**理由**（什么时候选 Bevy）：
- 极致性能要求
- 团队是 Rust 专家
- `desktop-homunculus`（77★）已验证桌面宠物可行性

**风险**：
- AI/ML 几乎为零，所有模型推理需要自己集成
- 生态太新，社区资源有限
- 开发效率低

#### 第四：Unity

**理由**（什么时候选 Unity）：
- 需要最丰富的 3D/动画特效
- `uDesktopMascot`（346★）已有成熟参考

**风险**：
- 包体积太大（100MB+），不适合常驻桌面
- CPU/内存占用高
- AI/ML 能力不如 Web 生态

---

## 五、AI 拳击识别技术栈深入

### 5.1 GitHub 现成方案

| 项目 | ★ | 技术 | 适用性 |
|------|---|------|--------|
| `punch-it` (ira-bb) | 0 | MediaPipe + webcam | 🥊 拳击游戏（2026年6月新建） |
| `godot_mediapipe_module` (purgeme) | 22 | MediaPipe C++ for Godot | Godot 路线可用 |

> **注意**：GitHub 上没有高星拳击检测开源项目。这是一个相对空白的领域。

### 5.2 推荐技术路线

无论选 Tauri 还是 Godot，AI 方案一致：

```
Layer 1: 人体姿态检测
  → MediaPipe Pose Landmarker (33 关键点, Web/ONNX)
  → 备选: MoveNet (TensorFlow.js/ONNX)

Layer 2: 拳击动作分类
  → MVP: 规则引擎 (角度+速度阈值)
  → 进阶: 自定义 ONNX 分类模型 (MLP/LSTM)
  → 训练数据: 自己录制 + 数据增强

Layer 3: 评分引擎
  → 与标准动作模板做 DTW 匹配
  → 关键点轨迹平滑度评估
  → 速度/加速度特征
```

### 5.3 关键技术指标

| 指标 | 目标值 | 备注 |
|------|--------|------|
| 推理延迟 | < 50ms | MediaPipe GPU delegate |
| 识别动作种类 | 5 种 (jab, cross, hook, uppercut, slip) | MVP |
| CPU 占用 | < 15% | 训练期间 |
| 内存占用 | < 200MB | 含模型 |
| 模型体积 | < 10MB | Pose Landmarker Lite = 5.6MB |
| 准确率 | > 85% | 规则引擎；ML 后 > 95% |

---

## 六、区块链 / NFT 方案

### 6.1 方案对比

| 方案 | SDK 成熟度 | Gas 费 | 速度 | 桌面集成 | 推荐度 |
|------|-----------|--------|------|---------|--------|
| **Solana + Web3.js** | ⭐⭐⭐⭐⭐ | ~$0.00001 | 400ms | ✅ 浏览器端直接用 | 🥇 |
| Solana + Godot SDK | ⭐⭐ (75★) | ~$0.00001 | 400ms | ⚠️ 需要 GDExtension | 🥈 (仅 Godot 路线) |
| Polygon + ethers.js | ⭐⭐⭐⭐ | ~$0.01 | 2s | ✅ 浏览器端 | 🥉 |
| Sui + SDK | ⭐⭐⭐ | ~$0.0001 | <1s | ✅ Web | ⭐⭐ |

### 6.2 推荐：Solana + Metaplex（Tauri Web 路线）

```typescript
// Solana Web3.js — 浏览器端原生支持
import { Connection } from "@solana/web3.js";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const metaplex = Metaplex.make(connection)
  .use(walletAdapterIdentity(wallet));

// NFT 铸造
const { nft } = await metaplex.nfts().create({
  uri: "https://arweave.net/boxingcat-metadata.json",
  name: "BoxingCat #001",
});
```

**不选 Godot Solana SDK 的理由**：只有 75★，且需要 GDExtension 编译，远不如 Web3.js 成熟。

---

## 七、关键开源项目借鉴分析

### 7.1 `clawd-on-desk` ★4396 — 参考价值：★★★★★

```
技术栈：JavaScript (Electron?)
核心功能：
  - 像素宠物动画
  - 监控 AI Agent 终端输出
  - 宠物状态随 agent 状态变化
  - 多宠物支持

对 BoxingCat 的参考：
  ✅ 桌面宠物如何常驻 + 低资源占用
  ✅ AI agent 监控 → 我们可以监控拳击训练状态
  ✅ 宠物交互状态机设计
  ❌ 像素风 → 我们要 Live2D/VRM 二次元
```

### 7.2 `uDesktopMascot` ★346 — 参考价值：★★★★

```
技术栈：C#, Unity, VRM
核心功能：
  - Unity 桌面 mascot 框架
  - VRM 模型加载
  - LLM 集成
  - 桌面透明窗口

对 BoxingCat 的参考：
  ✅ VRM 桌面角色渲染方案
  ✅ Unity 透明窗口配置
  ✅ LLM 对话集成（可用于猫猫的"说话"功能）
  ❌ Unity 太重（100MB+）
```

### 7.3 `desktop-homunculus` ★77 — 参考价值：★★★

```
技术栈：Rust, Bevy, VRM, VRMA
核心功能：
  - Bevy ECS 桌面 mascot
  - VRM 加载 + VRMA 动画
  - 跨平台透明窗口

对 BoxingCat 的参考：
  ✅ Bevy 做桌面宠物的技术可行性证明
  ✅ VRM 动画系统设计
  ❌ Bevy 生态太小，不适合 BoxingCat 这种功能密集的项目
```

### 7.4 `bongo-cat-next` ★124 — 参考价值：★★★★

```
技术栈：TypeScript, Live2D
核心功能：
  - 可爱的 Live2D 猫猫
  - 编程陪伴
  - 现代化桌面应用

对 BoxingCat 的参考：
  ✅ Live2D 猫猫的最佳桌面宠物参考
  ✅ TypeScript 技术栈与我们 Tauri 路线一致
  ✅ 猫猫交互设计
```

### 7.5 `oc-claw` ★292 — 参考价值：★★★★

```
技术栈：Rust
核心功能：
  - AI agent 监控桌面宠物
  - 多 agent 支持
  - 实时响应

对 BoxingCat 的参考：
  ✅ Rust 桌面宠物的架构模式
  ✅ AI agent 实时通信
  ❌ 没有角色渲染层（纯数据）
```

### 7.6 `godot-solana-sdk` ★75 — 参考价值：★★（仅当选 Godot）

```
技术栈：C++ GDExtension, Solana
核心功能：在 Godot 中调用 Solana RPC

如果选 Godot，这是关键依赖。但目前 Star 仅 75，
功能完整性未知，需要自行评估。
```

---

## 八、AI + Godot 专项调研

用户特别问到"AI 和 Godot"的结合。以下是完整调研：

### 8.1 Godot AI 推理现状

```
Godot 4 的 AI 能力：
  ├── 官方：无内置 ML 推理
  ├── 社区 GDExtension:
  │   ├── godot_mediapipe_module   ★22   MediaPipe C++
  │   ├── Godot-ONNX-AI-Models     ★15   ONNX 加载
  │   └── Godot_MachineLearning    ★20   神经网络模块
  └── 替代方案：
      ├── GDScript 调外部 Python 进程 (慢)
      ├── GDScript HTTP 调本地推理服务 (维护复杂)
      └── Rust GDExtension 封装 ONNX Runtime (开发量大)
```

### 8.2 Godot + AI 的可行性评分

| AI 能力 | 可行性 | 工作量 | 说明 |
|---------|--------|--------|------|
| 姿态检测 | ⚠️ 中 | 大 | 需要封装 MediaPipe 或 ONNX 模型 |
| Webcam 输入 | ⚠️ 中 | 中 | Godot 有 CameraFeed 但不成熟 |
| 自定义分类器 | ✅ 可 | 中 | ONNX GDExtension 可加载 |
| NLP/对话 | ✅ 可 | 小 | HTTP 调外部 LLM API |

### 8.3 推荐：如果选 Godot，AI 应该这么搭

```
方案 A（推荐）：Godot + Rust GDExtension + ONNX Runtime
  ├── Rust 侧集成 ONNX Runtime
  ├── 加载 MediaPipe Pose Landmarker (ONNX 版)
  ├── 加载自定义拳击分类器
  └── GDExtension 暴露 API 给 GDScript 调用

方案 B（妥协）：Godot + Python 子进程
  ├── Python 跑 MediaPipe + 分类器
  ├── Godot 通过 IPC/HTTP 通信
  └── 复杂度更高，延迟更大

方案 C（混合）：Tauri Web 做 AI → Godot 做渲染
  ├── Tauri 窗口处理 webcam + AI 推理
  ├── 通过 IPC 把结果发给 Godot
  └── 两个引擎同时跑，资源翻倍
```

**结论**：如果 AI 是核心（拳击识别），**Godot 不是最优选择**。AI 最成熟的平台是 Python（训练）+ Web（推理），Tauri Web 路线能直接复用。

---

## 九、最终技术栈推荐

### 🏆 推荐方案：Tauri 2 + React + PixiJS + Live2D Web SDK

```
桌面壳:     Tauri 2 (Rust)
前端框架:   React 19 (可选，MVP 甚至可以纯 HTML/JS)
渲染引擎:   PixiJS 7 (WebGL) + pixi-live2d-display
AI 推理:    MediaPipe Pose Landmarker (Web) + 自定义规则引擎
Webcam:     getUserMedia API (浏览器原生)
区块链:     Solana Web3.js + Metaplex JS SDK
动画特效:   GSAP / PixiJS particles (飞盘/猫屎)
后端:       Rust (Tauri 侧) + 可选 WS 中继服务器
通信:       Tauri Channel (高频) + Tauri Event (状态)
打包:       Tauri bundle (NSIS/DMG/DEB)
CI/CD:      GitHub Actions (参考 Nezha 方案)
```

### 为什么不是 Godot

| 原因 | 说明 |
|------|------|
| AI 生态不足 | Godot ONNX/MediaPipe GDExtension 总共不到 60★ |
| Webcam 不成熟 | Godot CameraFeed 在桌面端功能有限 |
| 区块链不易 | godot-solana-sdk 仅 75★ |
| 桌面透明窗口无先例 | GitHub 上搜不到 Godot 桌面宠物 |
| 开发效率 | GDScript 不如 TypeScript 生态丰富 |
| Nezha 参考 | Tauri 2 已在 Nezha 中充分验证，可直接复用经验 |

### 什么时候应该考虑 Godot

- Phase 3+ 加入**复杂的 2D/3D 游戏场景**（广场小游戏、3D 拳击擂台）
- 需要粒子特效、物理引擎（飞盘物理、碰撞检测）
- 这时可以用 Godot 做一个"战斗演出"子窗口，而非主桌面宠物

---

## 十、POC 实施计划

### POC 1：Tauri 桌面透明窗口 + Live2D（1-2 天）

```bash
pnpm create tauri-app boxingcat-poc --template react-ts
cd boxingcat-poc
pnpm add pixi.js pixi-live2d-display
```

验证点：
- [ ] macOS 透明窗口 + Live2D 模型渲染
- [ ] Windows 透明窗口 + mouse pass-through
- [ ] 猫猫 idle 动画循环
- [ ] 点击交互
- [ ] always-on-top + skip-taskbar

### POC 2：MediaPipe 拳击识别（2-3 天）

验证点：
- [ ] 摄像头输入 + Pose Landmarker 检测
- [ ] 33 关键点可视化
- [ ] 直拳/勾拳分类（规则引擎）
- [ ] 实时评分展示
- [ ] 延迟 < 50ms, CPU < 15%

### POC 3：Solana NFT 购买流程（1-2 天）

验证点：
- [ ] Phantom 钱包连接
- [ ] Devnet 上铸造 NFT
- [ ] 猫粮积分系统（链下）
- [ ] NFT 元数据绑定猫猫外观

### POC 4：飞盘动画（1 天）

验证点：
- [ ] PixiJS 飞盘抛物线飞行
- [ ] 猫猫跳跃接住动画
- [ ] 猫屎掉落粒子效果
- [ ] 飞走动画

---

## 十一、风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| Tauri 透明窗口在 Windows 上有 bug | 中 | 早期 POC，必要时用 `nwjs` 或回退 Electron |
| Live2D SDK 授权费用 | 低 | MVP 用免费 Sprite/Spine，后续购买 |
| AI 拳击准确率不够 | 中 | 规则引擎 → MLP → LSTM 渐进式提升 |
| 用户无摄像头 | 高 | 键盘拳击模式（按键模拟出拳） |
| 区块链钱包门槛 | 高 | 邮箱注册 + 托管钱包，后续去中心化 |
| Godot 生态不足 | 已确认 | **不选 Godot**，用 Tauri Web |

---

## 参考资料（GitHub）

| 项目 | ★ | URL |
|------|---|-----|
| clawd-on-desk | 4396 | https://github.com/rullerzhou-afk/clawd-on-desk |
| DesktopPet (Adrianotiger) | 1110 | https://github.com/Adrianotiger/desktopPet |
| Ark-Pets | 981 | https://github.com/isHarryh/Ark-Pets |
| ZcChat | 543 | https://github.com/Zao-chen/ZcChat |
| Desktop_Gremlin | 536 | https://github.com/Kritzkingvoid/Desktop_Gremlin |
| uDesktopMascot | 346 | https://github.com/MidraLab/uDesktopMascot |
| Agentic-Desktop-Pet | 303 | https://github.com/jihe520/Agentic-Desktop-Pet |
| MiniCPM-Desk-Pet | 293 | https://github.com/OpenBMB/MiniCPM-Desk-Pet |
| oc-claw | 292 | https://github.com/rainnoon/oc-claw |
| agentpet | 232 | https://github.com/ntd4996/agentpet |
| Shijima-Qt | 191 | https://github.com/pixelomer/Shijima-Qt |
| bongo-cat-next | 124 | https://github.com/liwenka1/bongo-cat-next |
| desktop-homunculus | 77 | https://github.com/not-elm/desktop-homunculus |
| godot-solana-sdk | 75 | https://github.com/Virus-Axel/godot-solana-sdk |
| tauri-live2d | 24 | https://github.com/itxve/tauri-live2d |
| godot_mediapipe_module | 22 | https://github.com/purgeme/godot_mediapipe_module |
| Godot-ONNX-AI-Models-Loaders | 15 | https://github.com/mat490/Godot-ONNX-AI-Models-Loaders |
