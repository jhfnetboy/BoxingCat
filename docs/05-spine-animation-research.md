# Spine 骨骼动画调研 — BoxingCat 猫猫渲染方案

> 调研日期：2026-06-17
> 动机：让 BoxingCat 的猫猫从 emoji 升级为可编程控制的骨骼动画角色

---

## 一、Spine 是什么？

**Spine**（esotericsoftware.com）是一个专业的 **2D 骨骼动画工具**，被广泛用于游戏行业。它的核心思路是：

```
美术制作阶段（Spine Editor）：
  图片切片（头/身体/手臂/腿/尾巴...）
    → 绑定骨骼（Bone hierarchy）
      → 制作动画（idle/walk/jump/punch/sleep...）
        → 导出 .json/.skel + .atlas + .png

运行时阶段（Spine Runtime）：
  加载骨骼数据 → 在引擎中渲染 → 程序控制骨骼变换 → 实时混合动画
```

**和 Live2D 的区别**：

| | Spine | Live2D |
|------|-------|--------|
| 动画原理 | 骨骼驱动（Bone transform） | 网格变形（Mesh deformation） |
| 美术风格 | 通用 2D 游戏风格 | 专精二次元/anime 风格 |
| 程序控制 | ⭐⭐⭐⭐⭐ 每个 Bone 可独立 setPosition/setRotation | ⭐⭐⭐ 参数驱动（Parameter） |
| 动画混合 | 支持多动画同时播放 + 混合权重 | 有限支持 |
| 运行时体积 | ~200KB (web) | ~1MB (Cubism SDK) |
| 商业授权 | 需要购买（$69-$299/人） | 需要购买（按收入） |
| Web 支持 | ✅ spine-ts / pixi-spine | ✅ Cubism SDK for Web |
| 社区生态 | 游戏行业主流 | 二次元/VTuber 主流 |

---

## 二、Spine 运行时技术细节

### 2.1 官方运行时架构

```
EsotericSoftware/spine-runtimes (5158★)
  ├── spine-ts/          ← TypeScript/JavaScript (Web)
  │   ├── core/          ← 骨骼计算核心（平台无关）
  │   ├── canvas/        ← Canvas 2D 渲染后端
  │   ├── webgl/         ← WebGL 渲染后端
  │   └── threejs/       ← Three.js 渲染后端
  ├── spine-c/           ← C 运行时
  ├── spine-cpp/         ← C++ 运行时
  ├── spine-unity/       ← Unity
  └── spine-godot/       ← Godot
```

**我们需要的**：`spine-ts` 的 `core` + `webgl` 后端，通过 `pixi-spine` 插件集成到 PixiJS。

### 2.2 pixi-spine 插件（推荐方案）

```
pixijs-userland/spine (625★)
```

这是 PixiJS 的官方 Spine 插件，直接让 PixiJS 的 `Container` 体系加载和渲染 Spine 骨骼：

```typescript
import { Spine } from "pixi-spine";

// 加载骨骼资源
const spineData = await PIXI.Assets.load("/cat/skeleton.json");

// 创建 Spine 实例
const cat = new Spine(spineData);

// 播放动画
cat.state.setAnimation(0, "idle", true);   // 循环播放 idle
cat.state.addAnimation(0, "punch", false);  // 叠加 punch 动画

// 程序控制骨骼！
const bone = cat.skeleton.findBone("right_arm");
bone.rotation = 0.5;  // 直接旋转手臂骨骼
bone.x = 10;           // 直接移动骨骼位置

// 混合多个动画
cat.state.setAnimation(0, "walk", true);
cat.state.addAnimation(1, "tail_wag", true, 0, 0.5); // 尾巴以 50% 权重同时播放

// 动画速度控制
const track = cat.state.setAnimation(0, "jump", false);
track.timeScale = 0.5; // 慢动作

// 添加到 PixiJS 舞台
app.stage.addChild(cat);
```

### 2.3 骨骼编程能力

这是 Spine 最大的优势——**所有骨骼都可以在运行时被代码操控**：

```typescript
// 让猫猫看向鼠标位置
const head = cat.skeleton.findBone("head");
const mouseX = ...; // 鼠标 X 坐标
head.rotation = Math.atan2(mouseY - head.worldY, mouseX - head.worldX);

// 拳击动作：程序驱动手臂
const rightUpperArm = cat.skeleton.findBone("right_upper_arm");
const rightForearm = cat.skeleton.findBone("right_forearm");

// 直拳：上臂前伸 + 前臂伸直
rightUpperArm.rotation = -0.8;
rightForearm.rotation = 0.1;

// 勾拳：上臂侧旋 + 前臂弯曲
rightUpperArm.rotation = -0.3;
rightForearm.rotation = -1.2;
```

**这正好匹配 BoxingCat 的需求**：
- 🥊 训练时让猫猫做拳击动作（程序驱动手臂骨骼）
- 😴 闲置时播放 idle 动画（预设动画）
- 🚶 随机走动（walk 动画 + 程序控制位移）
- 🥏 飞盘飞来时跳跃接住（jump + 程序控制手臂）

---

## 三、与现有项目集成方案

### 3.1 技术栈契合度

```
当前 BoxingCat 技术栈：
  Tauri 2 → Rust 桌面壳
  React 19 → UI 框架
  PixiJS 6.5.10 → 2D 渲染引擎 ← 已有！
  pixi-live2d-display → Live2D（暂未使用）

Spine 集成方案：
  Tauri 2 → 不变
  React 19 → 不变（PixiJS 在 Canvas 中运行，不经过 React）
  PixiJS 6.5.10 → 已有！
  + pixi-spine → npm install @pixi-spine/runtime-4.1 （PixiJS 6 对应 spine 4.1）
```

**关键发现**：pixi-spine 对 PixiJS 6 的支持需要 `@pixi-spine/runtime-4.1`，而我们项目中已有 `pixi.js@6.5.10`。版本完全兼容。

### 3.2 安装与集成步骤

```bash
# 安装 Spine PixiJS 插件
pnpm add @pixi-spine/runtime-4.1

# 猫猫骨骼资源放在
assets/cat/
  ├── skeleton.json   # 骨骼数据
  ├── skeleton.atlas   # 图集描述
  └── skeleton.png     # 纹理图集
```

### 3.3 替换 CatViewer 组件

```typescript
// src/components/CatViewer.tsx（新版本）
import { useRef, useEffect } from "react";
import * as PIXI from "pixi.js";
import { Spine } from "@pixi-spine/runtime-4.1";

interface Props {
  state: "idle" | "walking" | "sleeping" | "excited" | "training";
  punchType?: "jab" | "hook" | "uppercut" | null;
}

export default function CatViewer({ state, punchType }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spineRef = useRef<Spine | null>(null);

  useEffect(() => {
    const app = new PIXI.Application({
      backgroundAlpha: 0,
      resizeTo: containerRef.current!,
    });
    containerRef.current!.appendChild(app.view as HTMLCanvasElement);

    // 加载猫猫骨骼
    PIXI.Assets.load("/assets/cat/skeleton.json").then((data) => {
      const cat = new Spine(data);
      cat.state.setAnimation(0, "idle", true);
      app.stage.addChild(cat);
      spineRef.current = cat;
    });

    return () => app.destroy();
  }, []);

  // 根据状态切换动画
  useEffect(() => {
    const cat = spineRef.current;
    if (!cat) return;

    switch (state) {
      case "idle": cat.state.setAnimation(0, "idle", true); break;
      case "walking": cat.state.setAnimation(0, "walk", true); break;
      case "sleeping": cat.state.setAnimation(0, "sleep", true); break;
      case "excited": cat.state.setAnimation(0, "excited", false); break;
      case "training": cat.state.setAnimation(0, "training_ready", true); break;
    }
  }, [state]);

  // 拳击动作 — 程序驱动
  useEffect(() => {
    if (!punchType || !spineRef.current) return;
    const cat = spineRef.current;
    const rightArm = cat.skeleton.findBone("right_upper_arm");
    if (!rightArm) return;

    // 播放预设 punch 动画 + 程序微调
    cat.state.setAnimation(1, punchType, false); // track 1 = 上半身
  }, [punchType]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
```

### 3.4 需要预制的美术资源

| 骨骼部位 | 说明 |
|---------|------|
| head | 头部 |
| body | 身体（躯干） |
| left_upper_arm / left_forearm / left_hand | 左臂 |
| right_upper_arm / right_forearm / right_hand | 右臂（拳击主手） |
| left_upper_leg / left_lower_leg | 左腿 |
| right_upper_leg / right_lower_leg | 右腿 |
| tail_1 / tail_2 / tail_3 | 尾巴（多节） |
| ear_left / ear_right | 耳朵 |

| 动画 | 帧数 | 循环 |
|------|------|------|
| idle | ~60f | ✅ 呼吸感 |
| walk | ~30f | ✅ 走路 |
| sleep | ~90f | ✅ 睡觉 |
| excited | ~20f | ❌ 兴奋跳跃 |
| jab | ~15f | ❌ 直拳 |
| hook | ~15f | ❌ 勾拳 |
| uppercut | ~15f | ❌ 上勾拳 |
| catch_frisbee | ~20f | ❌ 接飞盘 |
| hit_by_poop | ~30f | ❌ 被猫屎砸 |

---

## 四、Spine vs 替代方案

### 4.1 对比表

| 维度 | Spine | Live2D | VRM (3D) | CSS/Lottie | Emoji（当前） |
|------|:---:|:---:|:---:|:---:|:---:|
| 骨骼编程 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ❌ | ❌ |
| 2D 表现力 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐ |
| Web 集成难度 | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 运行时体积 | ~200KB | ~1MB | ~5MB+ | ~50KB | 0 |
| 商业授权 | $69-$299/人 | 按收入 | 免费 | 免费 | 免费 |
| 动画混合 | ✅ | ❌ | ✅ | ❌ | ❌ |
| 美术资源制作 | Spine Editor | Cubism Editor | Blender/Maya | After Effects | 无 |
| 学习曲线 | 中 | 中高 | 高 | 低 | 无 |

### 4.2 为什么选 Spine 而不是 Live2D

| BoxingCat 需求 | Spine | Live2D |
|---------------|-------|--------|
| 程序控制猫猫出拳 | ✅ 骨骼直接操作 | ⚠️ 参数驱动，不直观 |
| 实时响应拳击检测 | ✅ setBone.rotation = x | ⚠️ setParameter，有延迟 |
| 动画混合（边走边出拳） | ✅ 多 track 混合 | ❌ 不原生支持 |
| 运行时轻量 | ✅ ~200KB | ⚠️ ~1MB |
| 游戏/桌面宠物常见度 | 行业标准 | 二次元特化 |
| PixiJS 集成 | ✅ pixi-spine (625★) | ✅ pixi-live2d-display |

---

## 五、Spine 许可证

Spine 采用 **按人头买断制**（非订阅）：

| 版本 | 价格 | 用途 |
|------|------|------|
| Essential | $69 | 基础功能，年收入 <$500K |
| Professional | $299 | 完整功能，无收入限制 |

**注意**：Spine Runtime 的代码是**开源**的（BSD 许可），可以自由集成。许可证只涉及 **Spine Editor**（用来制作骨骼和动画的工具）。如果美术资源由第三方提供，我们只需要 Runtime 代码（免费）。

---

## 六、实施计划

### Phase A：验证可行性（1-2 天）

```bash
# 1. 安装 pixi-spine
pnpm add @pixi-spine/runtime-4.1

# 2. 获取测试用的 Spine 骨骼资源
#    - 从 Spine 官方示例中下载（spineboy 或其他免费角色）
#    - 或从 itch.io / opengameart 找免费 Spine 猫猫

# 3. 在项目中渲染一个 Spine 角色
#    - 替换 CatViewer 中的 emoji
#    - 测试动画切换（idle/walk/jump）
#    - 测试骨骼编程（手动旋转手臂）
```

### Phase B：猫猫骨骼制作（3-5 天，需美术）

```
1. 设计 BoxingCat 猫猫形象（白色德文？橘猫？）
2. 在 Spine Editor 中切片 + 绑骨
3. 制作核心动画：idle / walk / sleep / excited
4. 制作拳击动画：jab / hook / uppercut
```

### Phase C：集成到项目（2-3 天）

```
1. 替换 CatViewer 组件
2. 连接训练检测 → 骨骼驱动（检测到 punch → 猫猫同步出拳）
3. 动画状态机：根据 catState 切换
4. 飞盘/猫屎等特效叠加
```

---

## 七、结论

**Spine 是目前 BoxingCat 的最佳猫猫渲染方案**：

1. ✅ 骨骼可编程 → 完美匹配拳击检测驱动的动作需求
2. ✅ pixi-spine 625★ → PixiJS 集成成熟，我们在用 PixiJS 6
3. ✅ 运行时轻量 → ~200KB，适合桌面宠物
4. ✅ 动画混合 → 边走边出拳、边睡边摇尾巴都可以
5. ✅ 行业标准 → 大量成熟美术资源和工具链
6. ⚠️ 需要 Spine Editor 许可证（$69/人，Essential 版已足够）
7. ⚠️ 需要制作猫猫骨骼美术资源（可由美术外包或用免费资源搭 MVP）

**建议下一步**：先不买许可证，用免费 Spine 资源做 POC（Phase A），验证骨骼编程 + PixiJS 渲染可行后，再投入美术制作。
