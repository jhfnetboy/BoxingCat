# BoxingCat 文档索引

## 文档版本导航

### 核心文档

| 文件 | 说明 | 状态 |
|------|------|------|
| [01-original-vision.md](./01-original-vision.md) | 创始人原始愿景（零删改） | ✅ 基准文档 |
| [02-product-design.md](./02-product-design.md) | 系统化产品设计 | ✅ 持续更新 |
| [04-framework-selection-and-milestones.md](./04-framework-selection-and-milestones.md) | 基础框架选型 + 开发里程碑 | ✅ 待 Review |

### 技术调研（两版互补）

| 版本 | 文件 | 侧重 | 状态 |
|------|------|------|------|
| **V1** | [03-v1-initial-tech-analysis.md](./03-v1-initial-tech-analysis.md) | 理论分析 + 代码示例 + 技术细节 | ✅ 保留参考 |
| **V2** | [03-v2-github-deep-research.md](./03-v2-github-deep-research.md) | GitHub 搜索验证 + 社区对比 + 竞品分析 | ✅ 保留参考 |

**为什么有两个版本？**

- **V1**（初始分析）：基于经验的理论推演，包含大量代码示例（MediaPipe 集成、拳击分类器、评分引擎、Tauri 透明窗口配置等），适合开发者直接参考实现
- **V2**（深度搜索）：通过 `gh search repos` 对 GitHub 进行 30+ 次系统搜索后的验证稿，包含社区 Star 数据、竞品对比、Godot AI 生态评估等，适合技术决策

两版是**互补**关系：
- V1 有代码级细节，但未经社区验证
- V2 有社区数据验证，补充了 V1 的分析结论
- V2 验证了 V1 的大多数判断正确（Tauri 优选、Godot 桌宠生态不足等）

### 参考技术栈

| 文件 | 说明 |
|------|------|
| [../nezha-tech-stack/](../nezha-tech-stack/) | Nezha 项目技术栈提炼（Tauri 2 + Rust + React 参考实现） |
| [../reference-repos/](../reference-repos/) | GitHub 竞品仓库（7 个已 Clone 分析） |

---

## 当前技术决策

| 决策 | 选项 | 依据文档 |
|------|------|---------|
| 桌面壳 | Tauri 2（不选 Godot） | V2 深度调研：Godot 桌宠先例为零 |
| 渲染引擎 | Live2D Web SDK + PixiJS | V1 代码分析 |
| AI 姿态检测 | MediaPipe Pose Landmarker (Web) | V1 代码示例 |
| 拳击分类 | MVP 规则引擎 → 进阶 MLP | V1 Step 2-3 |
| 账户体系 | **AAStar SDK** (@aastar/sdk) | 自有账户 + Gasless |
| 区块链 | 不直接暴露链（AA 封装） | 降低用户门槛 |
| 后端 | Rust (Axum) + WS（可选） | V1 第七节 |

---

## 文档约定

- `01-` 前缀：产品需求（不可逆改，只追加）
- `02-` 前缀：产品设计（可迭代）
- `03-` 前缀：技术调研（多版本共存，标注 v1/v2/...）
- 历史版本**不删除**，新增版本时旧版加 `-vN-archive` 标记
