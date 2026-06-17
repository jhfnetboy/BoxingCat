# BoxingCat — 技术栈初步分析（V1 探索稿）

> **版本说明**：这是第一版技术调研，侧重技术方案的理论分析和代码示例。
> 后续 V2 版本进行了 GitHub 深度搜索验证。两份文档互补——V1 有代码级细节，V2 有社区验证。
> **保留原因**：V1 中的 MediaPipe 代码示例、拳击分类器实现思路、Tauri 透明窗口配置细节等在 V2 中被精简，仍有参考价值。

---

## 一、总体技术架构推荐（V1 初始判断）

```
┌─────────────────────────────────────────────────────────┐
│                    BoxingCat 架构                         │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │              桌面壳（Desktop Shell）               │  │
│  │     Tauri 2 + 透明窗口 + always-on-top             │  │
│  │  macOS: NSWindow transparent + nonActivating       │  │
│  │  Windows: WS_EX_LAYERED + WS_EX_TRANSPARENT       │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────┴───────────────────────────────┐  │
│  │              渲染引擎（Rendering）                  │  │
│  │     Live2D Cubism SDK for Web 或 Spine + PixiJS    │  │
│  │     Canvas 2D / WebGL 2 / PixiJS 7                 │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────┴───────────────────────────────┐  │
│  │              AI 识别（Vision）                      │  │
│  │     MediaPipe Pose Landmarker + 自定义分类器        │  │
│  │     浏览器端 WebGL 推理，零服务端开销                │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────┴───────────────────────────────┐  │
│  │              账户体系（Account）                    │  │
│  │     AAStar SDK (AAStarCommunity/aastar-sdk)        │  │
│  │     Account Abstraction + Gasless + Web3            │  │
│  │     npm: @aastar/sdk                               │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────┴───────────────────────────────┐  │
│  │              后端服务（Backend）                    │  │
│  │     Rust (Tauri 侧) + 可选 WS 中继                  │  │
│  │     飞盘路由 / 社交 / 通知 / 旅行事件               │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 二、桌面宠物渲染方案详细对比

### 2.1 方案矩阵

| 方案 | 透明窗口 | 跨平台 | 动画能力 | 性能 | 包体积 | 开发效率 | 推荐度 |
|------|---------|--------|---------|------|--------|---------|--------|
| **Tauri 2 + Web 渲染** | ✅ macOS原生, Windows 需配置 | ✅ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ~10MB | ⭐⭐⭐⭐⭐ | 🏆 **强烈推荐** |
| Electron + Web | ✅ | ✅ | ⭐⭐⭐⭐ | ⭐⭐ | ~150MB | ⭐⭐⭐⭐ | ⭐⭐ |
| Unity + 透明窗口 | ⚠️ 需要插件 | ✅ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ~50MB+ | ⭐⭐⭐ | ⭐⭐⭐ |
| Godot 4 | ⚠️ 实验性 | ✅ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ~30MB | ⭐⭐⭐ | ⭐⭐⭐ |
| 原生 (SwiftUI + WinUI) | ✅ | ❌ 需分别开发 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 最小 | ⭐⭐ | ⭐⭐ |

### 2.2 选择 Tauri 2 + Web 渲染的核心理由

1. **Nezha 已验证**：Tauri 2 的透明窗口、IPC、Channel 通信在 Nezha 项目中已稳定运行，可直接复用经验
2. **AI 生态最强**：MediaPipe、TensorFlow.js、ONNX Runtime Web 全部成熟可用
3. **Webcam 零成本**：`getUserMedia` API 稳定、浏览器级优化
4. **Live2D Web SDK 成熟**：`pixi-live2d-display` 已广泛使用
5. **AAStar SDK**：TypeScript SDK，`npm install @aastar/sdk` 直接集成
6. **体积小**：二进制 ~10MB，适合桌面宠物"常驻后台"的定位

### 2.3 透明窗口实现细节

**macOS**（Tauri 2 原生支持）：

```json
// tauri.conf.json
{
  "app": {
    "windows": [{
      "transparent": true,
      "decorations": false,
      "alwaysOnTop": true,
      "skipTaskbar": true,
      "width": 400,
      "height": 500,
      "resizable": false
    }]
  }
}
```

**Windows**（需要额外配置）：

```rust
use tauri::window::WindowBuilder;

WindowBuilder::new(app, "main", tauri::WindowUrl::App("index.html".into()))
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()?;
```

**鼠标穿透策略**：

```
透明窗口 (400x500)
    猫猫身体区域 → 接收点击/拖拽
    猫猫之外区域 → 鼠标穿透 (click-through)

实现：Canvas 像素 alpha 检测 + Tauri 窗口区域设置
- macOS: NSWindow.ignoresMouseEvents 动态切换
- Windows: SetWindowRgn 只保留非透明区域
```

---

## 三、动画渲染引擎

### 3.1 Live2D Cubism SDK for Web（主力推荐）

```
✅ 专为二次元角色设计，效果最好
✅ 成熟的 Web SDK，支持 Canvas/WebGL
✅ 丰富的社区资源
✅ 参数驱动（可以通过参数控制表情、动作）
✅ 呼吸感、物理模拟自然

❌ SDK 需要商业授权（根据收入规模）
❌ 模型制作需要 Cubism Editor
❌ 模型文件较大（1-5MB）
```

技术要点：

```html
<canvas id="live2d"></canvas>
<script type="module">
  import * as PIXI from 'pixi.js';
  import { Live2DModel } from 'pixi-live2d-display';

  const app = new PIXI.Application({
    view: canvas,
    transparent: true,    // 关键：背景透明
    backgroundAlpha: 0,
  });

  const model = await Live2DModel.from('/assets/cat.model3.json');
  app.stage.addChild(model);

  // 控制猫猫表情/动作（参数驱动）
  model.internalModel.motionManager.startMotion('idle');
  // 拳击动作
  model.internalModel.coreModel.setParameterValueById('ParamPunch', 1.0);
</script>
```

### 3.2 Spine Runtime + PixiJS（备选）

```
✅ 二次元常用骨骼动画
✅ 比 Live2D 更通用的 2D 骨骼系统
✅ PixiJS 集成良好

❌ Web Runtime 功能比 Live2D 少
❌ 二次元效果不如 Live2D 自然
```

### 3.3 MVP 快速方案：Lottie / Sprite Sheet

```
✅ 无需额外 SDK，体积最小，开发最快
❌ 动画效果有限，无法做到 Live2D 级别的表现力

建议：MVP 阶段用 Lottie 快速验证，正式版切换到 Live2D
```

---

## 四、AI 拳击动作识别（代码级分析）

### 4.1 核心需求

| 需求 | 目标 |
|------|------|
| 实时性 | < 100ms 延迟 |
| 动作识别 | 直拳(Jab/Cross)、勾拳(Hook)、上勾拳(Uppercut)、闪避(Slip) |
| 姿势评分 | 角度偏差 + 速度 + 连贯性 |
| 本地运行 | 不能依赖云端（隐私 + 延迟） |
| 低资源占用 | CPU < 15%，不影响编码工作 |

### 4.2 方案对比

| 方案 | 实时性 | 准确性 | 资源占用 | 开发难度 | 推荐 |
|------|--------|--------|---------|---------|------|
| **MediaPipe Pose + 规则引擎** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 🏆 MVP |
| MoveNet (TF.js) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| BlazePose | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| YOLOv8-Pose (ONNX) | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

### 4.3 实现路径（代码示例）

**Step 1：MediaPipe Pose 集成**

```typescript
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// 初始化（GPU 加速）
const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
);
const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath: "/models/pose_landmarker_lite.task", // 本地部署 5.6MB
    delegate: "GPU", // WebGL 加速
  },
  runningMode: "VIDEO",
  numPoses: 1,
});

// 每帧检测
async function detectPose(videoFrame: HTMLVideoElement) {
  const result = await poseLandmarker.detectForVideo(
    videoFrame,
    performance.now()
  );
  return result.landmarks[0]; // 33 个 3D 关键点
}
```

**拳击相关的 33 个关键点中实际使用的**：

```
肩膀：11(左), 12(右)
肘部：13(左), 14(右)
手腕：15(左), 16(右)  ← 拳击核心
髋部：23(左), 24(右)
鼻子：0（头部，判断闪避）
```

**Step 2：拳击动作分类器（规则引擎版）**

```typescript
interface PoseLandmark {
  x: number; y: number; z: number;
  visibility: number;
}

function calculateAngle(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number {
  // 计算 ∠ABC（三点夹角）
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
  const magC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);
  return Math.acos(dot / (magA * magC)) * (180 / Math.PI);
}

function calculateVelocity(
  prev: PoseLandmark | undefined,
  curr: PoseLandmark,
  dt: number
): number {
  if (!prev) return 0;
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  return Math.sqrt(dx * dx + dy * dy) / dt;
}

// 分类阈值（需根据实际测试调优）
const JAB_SPEED_THRESHOLD = 0.15;      // 直拳速度阈值
const HOOK_SPEED_THRESHOLD = 0.12;     // 勾拳速度阈值
const JAB_ARM_ANGLE_MIN = 140;         // 直拳手臂最小角度（接近伸直）
const HOOK_ARM_ANGLE_MIN = 60;         // 勾拳手臂最小角度
const HOOK_ARM_ANGLE_MAX = 120;        // 勾拳手臂最大角度
const HOOK_SHOULDER_ROTATION = 25;     // 勾拳肩部旋转阈值
const DODGE_HEAD_OFFSET = 0.08;        // 闪避头部偏移阈值

type BoxingMove = "jab" | "cross" | "hook" | "uppercut" | "slip" | "idle";

function classifyBoxingMove(
  pose: PoseLandmark[],
  prevPose: PoseLandmark[] | null,
  dt: number
): BoxingMove {
  // 手臂角度
  const rightArmAngle = calculateAngle(pose[12], pose[14], pose[16]);
  const leftArmAngle = calculateAngle(pose[11], pose[13], pose[15]);

  // 手腕速度
  const rightWristVel = calculateVelocity(
    prevPose?.[16], pose[16], dt
  );
  const leftWristVel = calculateVelocity(
    prevPose?.[15], pose[15], dt
  );

  // 肩部旋转（用于判断勾拳/摆拳）
  const shoulderAngle = Math.abs(
    Math.atan2(pose[11].y - pose[12].y, pose[11].x - pose[12].x)
  ) * (180 / Math.PI);

  // 头部偏移（闪避检测）
  const headOffset = prevPose
    ? Math.sqrt(
        (pose[0].x - prevPose[0].x) ** 2 +
        (pose[0].y - prevPose[0].y) ** 2
      )
    : 0;

  // ── 分类逻辑 ────────────────────────────────────────

  // 直拳（Jab）：手臂接近伸直 + 高速前冲
  if (rightWristVel > JAB_SPEED_THRESHOLD && rightArmAngle > JAB_ARM_ANGLE_MIN) {
    return "jab";
  }
  if (leftWristVel > JAB_SPEED_THRESHOLD && leftArmAngle > JAB_ARM_ANGLE_MIN) {
    return "cross";
  }

  // 勾拳（Hook）：手臂弯曲 + 肩部旋转 + 手腕高速
  if (
    rightWristVel > HOOK_SPEED_THRESHOLD &&
    rightArmAngle > HOOK_ARM_ANGLE_MIN &&
    rightArmAngle < HOOK_ARM_ANGLE_MAX &&
    shoulderAngle > HOOK_SHOULDER_ROTATION
  ) {
    return "hook";
  }

  // 上勾拳（Uppercut）：手腕垂直向上高速
  if (
    rightWristVel > HOOK_SPEED_THRESHOLD &&
    prevPose &&
    pose[16].y < prevPose[16].y - 0.05 // 手腕显著上升
  ) {
    return "uppercut";
  }

  // 闪避（Slip）：头部大幅偏移
  if (headOffset > DODGE_HEAD_OFFSET) {
    return "slip";
  }

  return "idle";
}
```

**Step 3：评分引擎**

```typescript
interface ScoreResult {
  poseScore: number;        // 姿势准确度 (0-100)
  powerScore: number;       // 力量感 (0-100)
  consistencyScore: number; // 连贯性 (0-100)
  totalScore: number;       // 综合评分
  catFoodEarned: number;    // 猫粮产出
  agilityGained: number;    // 敏捷度增长
}

function calculateScore(
  userPose: PoseLandmark[],
  referencePose: PoseLandmark[], // 标准动作关键点
  velocityCurve: number[],       // 速度序列
  duration: number
): ScoreResult {
  // 姿势准确度：与标准动作的关键点角度偏差
  const angleDiff = calculateAngleDeviation(userPose, referencePose);
  const poseScore = Math.max(0, 100 - angleDiff * 2);

  // 力量感：基于速度峰值和平均速度
  const maxVel = Math.max(...velocityCurve);
  const avgVel = velocityCurve.reduce((a, b) => a + b, 0) / velocityCurve.length;
  const powerScore = normalizeScore(maxVel * 0.6 + avgVel * 0.4);

  // 连贯性：速度曲线的平滑度（导数方差）
  const consistencyScore = evaluateSmoothness(velocityCurve);

  // 综合评分
  const totalScore =
    poseScore * 0.40 +
    powerScore * 0.25 +
    consistencyScore * 0.20 +
    Math.min(duration / 60, 1) * 15; // 耐力加分（最多15分）

  return {
    poseScore,
    powerScore,
    consistencyScore,
    totalScore: Math.round(totalScore),
    catFoodEarned: Math.floor(totalScore * 0.5),      // 评分 → 猫粮
    agilityGained: Math.floor(totalScore * 0.3),       // 评分 → 敏捷度
  };
}
```

### 4.4 进阶方案：从规则引擎到 ML 模型

```
Phase 1 (MVP)：    规则引擎（角度 + 速度阈值）
Phase 2 (优化)：    MLP 分类器（ONNX Runtime Web）
                    输入：N帧 × 33个关键点 × 3个坐标
                    输出：5种拳击动作 + idle
Phase 3 (最高)：    LSTM/Transformer 时序模型
                    捕捉动作的完整时序特征
                    训练数据：自己录制 + 标注 + 数据增强
```

---

## 五、AAStar 账户体系

### 5.1 AAStar SDK 概要

```
仓库：   AAStarCommunity/aastar-sdk
npm：    @aastar/sdk
语言：   TypeScript
特性：
  ✅ Account Abstraction (ERC-4337)
  ✅ Gasless 交易（用户无感）
  ✅ Web3 账户管理
  ✅ 内置社交恢复

适用 BoxingCat 的场景：
  - 主人账户注册（无需助记词）
  - NFT 购买（Gasless）
  - 猫猫 Agent 账户派生
  - 猫粮代币管理
```

### 5.2 账户模型

```
AAStar 账户体系：
  ├── 主人账户（Master Account）
  │   ├── 邮箱/社交登录创建
  │   ├── AA 智能合约钱包
  │   ├── 持有 NFT 资产
  │   └── 持有猫粮代币
  │
  └── 猫猫 Agent 账户
      ├── 从主人账户派生
      ├── 不直接持有资产
      └── 存储链上属性：敏捷度、等级
```

### 5.3 为什么用 AAStar 而非直接 Solana

| 维度 | Solana Web3.js | AAStar SDK |
|------|---------------|------------|
| Gas 费 | 用户需持有 SOL | Gasless |
| 助记词 | 需要 | 邮箱/社交登录 |
| 新用户体验 | 需要理解钱包概念 | 零门槛 |
| 目标用户匹配 | 加密原生用户 | 宅男程序员（不需要懂 Crypto） |
| Account Abstraction | 无 | ✅ ERC-4337 |

---

## 六、桌面透明窗口深入方案

### 6.1 Tauri 2 透明窗口代码

```rust
// src-tauri/src/main.rs
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_window("main").unwrap();

            // macOS 特定
            #[cfg(target_os = "macos")]
            {
                // 设置为浮动面板级别（在所有窗口之上但不抢焦点）
                window.set_always_on_top(true);
                // 在所有 Space 显示
                // window.set_visible_on_all_spaces(true);
            }

            // Windows 特定
            #[cfg(target_os = "windows")]
            {
                use windows::Win32::UI::WindowsAndMessaging::{
                    SetWindowLongW, GetWindowLongW, GWL_EXSTYLE,
                    WS_EX_LAYERED, WS_EX_TRANSPARENT, WS_EX_TOOLWINDOW,
                };
                let hwnd = window.hwnd().unwrap();
                unsafe {
                    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                    SetWindowLongW(
                        hwnd, GWL_EXSTYLE,
                        ex_style |
                        WS_EX_LAYERED as i32 |
                        WS_EX_TRANSPARENT as i32 |
                        WS_EX_TOOLWINDOW as i32
                    );
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 6.2 鼠标事件穿透

```html
<!-- CSS 侧 -->
<style>
  body {
    background: transparent;
    margin: 0;
    overflow: hidden;
  }
  #live2d-canvas {
    background: transparent;
  }
</style>
```

```javascript
// Canvas 像素级点击检测
canvas.addEventListener('mousemove', (e) => {
  const ctx = canvas.getContext('2d');
  const pixel = ctx.getImageData(e.offsetX, e.offsetY, 1, 1);

  // 如果像素 alpha == 0（完全透明），穿透鼠标事件
  if (pixel.data[3] === 0) {
    window.__TAURI__.invoke('set_mouse_pass_through', {
      x: e.offsetX,
      y: e.offsetY
    });
  }
});
```

---

## 七、飞盘 + 旅行 + 社交后端

### 7.1 架构选择

```
MVP 方案：Tauri Rust 侧直接处理（无独立后端）
  优点：零运维成本，P2P 简单
  缺点：用户离线时无法收到飞盘
  适用：Phase 1-2 MVP

正式方案：WebSocket 中继服务器
  用户A (Tauri) ←→ WS 中继 (Rust/Go) ←→ 用户B (Tauri)
```

### 7.2 推荐后端技术栈

| 组件 | 技术 | 理由 |
|------|------|------|
| 后端语言 | Rust (Axum/Actix-web) | 与 Tauri 侧同语言 |
| 实时通信 | WebSocket (tokio-tungstenite) | 飞盘到达通知 |
| 数据库 | PostgreSQL / SQLite (MVP) | 飞盘记录、用户数据 |
| 消息推送 | 通过 Tauri 桌面通知 | 猫猫归来通知 |

### 7.3 飞盘路由算法

```
飞盘发射流程：
  1. 用户 A 购买飞盘（消耗猫粮）
  2. 客户端发送: { type: "launch_frisbee", rarity: "common" }
  3. 服务器随机选择在线用户 B
  4. 通知用户 B: { type: "frisbee_incoming", rarity: "common" }

飞盘到达：
  5. 用户 B 桌面播放飞盘飞入动画
  6. 根据用户 B 敏捷度判定捕获
  7. 结果上报服务器
  8. 双方数据更新 + 通知
```

### 7.4 旅行系统（客户端为主）

```
猫猫旅行实现：
  - 用户触发或定时自动触发
  - 客户端随机选择目的地和时长
  - 定时器到期后猫猫归来
  - 随机事件表 → 带回物品/消息

可选服务端：
  - 旅行时可能"遇到"其他用户的猫
  - 归来物品稀有度校验（防作弊）
```

---

## 八、POC 验证计划（V1 版）

### POC 1：Tauri 透明桌面窗口 + Live2D

```bash
pnpm create tauri-app boxingcat-poc --template react-ts
cd boxingcat-poc
pnpm add pixi.js pixi-live2d-display
```

验证点：
- [ ] macOS 透明窗口 + Live2D 渲染正确
- [ ] Windows 透明窗口 + mouse pass-through
- [ ] 猫猫 idle 动画循环
- [ ] 点击交互（猫猫反应）
- [ ] always-on-top + skip-taskbar
- [ ] CPU < 5%, GPU < 10% (idle)

### POC 2：AI 拳击识别

验证点：
- [ ] 摄像头输入 getUserMedia
- [ ] Pose Landmarker 检测延迟 < 50ms
- [ ] 直拳/勾拳分类准确率 > 80%
- [ ] 规则引擎评分与人直觉一致
- [ ] CPU < 15%（训练期间）
- [ ] WebGL 在集成显卡正常

### POC 3：AAStar 账户 + NFT

验证点：
- [ ] @aastar/sdk 集成
- [ ] 邮箱注册账户流程
- [ ] Gasless 交易
- [ ] NFT 铸造（猫猫外观绑定）
- [ ] 猫猫 Agent 账户派生

### POC 4：飞盘动画

验证点：
- [ ] PixiJS 飞盘抛物线飞行
- [ ] 猫猫跳跃捕获动画
- [ ] 猫屎掉落粒子效果
- [ ] 飞走过渡动画

---

## 九、技术风险评估（V1 版）

| 风险 | 影响 | 概率 | 缓解 |
|------|------|------|------|
| Tauri 透明窗口跨平台不一致 | 高 | 中 | 早期 POC，必要时回退 Electron |
| AI 拳击准确率不足 | 高 | 中 | 规则引擎 → MLP → LSTM 渐进 |
| Live2D SDK 商业授权 | 中 | 低 | MVP 用 Lottie，授权OK后迁移 |
| 用户无摄像头 | 高 | 中 | 键盘拳击模式（按键出拳） |
| AAStar SDK 成熟度 | 中 | 中 | POC 阶段评估，备选邮箱+托管钱包 |
| 桌面宠物被安全软件误杀 | 中 | 低 | 代码签名 + 应用商店分发 |
