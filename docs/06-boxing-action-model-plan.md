# BoxingCat 拳击动作识别模型 — 完整训练方案

> 目标：训练一个轻量级拳击动作分类模型，替代手写规则，在浏览器端实时推理。

---

## 一、整体架构

```
Phase 1: 数据采集
  你对着摄像头做拳击动作 → 录制视频 + MediaPipe 提取关键点 → 保存为 .jsonl

Phase 2: 模型训练
  Python notebook → 加载关键点数据 → 训练 LSTM/1D-CNN → 导出 ONNX

Phase 3: 集成部署
  ONNX Runtime Web → 在 Tauri app 中加载 → 替换 classifyBoxingMove
```

---

## 二、数据采集方案

### 2.1 采集工具

不需要录视频文件。直接用 MediaPipe 提取 33 个关键点，保存每帧的关键点坐标。

**工具脚本**：在项目中新增 `scripts/collect-training-data.html`

```html
<!-- 独立的 HTML 页面，打开摄像头，实时显示骨架 -->
<!-- 按 1-5 数字键标记当前动作类型 -->
<!-- 自动保存关键点序列到 localStorage -->
```

### 2.2 动作类别（5 类）

| 标签 | 动作 | 采集数量 | 每段时长 |
|------|------|---------|---------|
| `idle` | 静止/站立不动 | 50 段 | 2-3 秒 |
| `jab` | 直拳（前手快速伸直） | 50 段 | 1-2 秒 |
| `cross` | 交叉拳（后手旋转出拳） | 40 段 | 1-2 秒 |
| `hook` | 勾拳（曲臂侧摆+转身） | 40 段 | 1-2 秒 |
| `uppercut` | 上勾拳（由下往上） | 30 段 | 1-2 秒 |

**总计约 210 段，每段 30-90 帧（约 1-3 秒）**

### 2.3 采集要求

- 不同角度：正面、稍微侧面
- 不同距离：离摄像头近/远
- 不同衣服：穿不同颜色/款式的衣服
- 不同速度：快速出拳、慢速出拳
- 不同光照：白天/晚上
- **包括过渡动作**：idle→jab→idle, jab→hook→idle 等

### 2.4 数据格式

每段保存为一个 JSON 文件：

```json
{
  "label": "jab",
  "frames": [
    {
      "landmarks": [[x,y,z,v], [x,y,z,v], ...],  // 33个关键点 × 4个值
      "timestamp": 1234567890
    },
    ...
  ]
}
```

---

## 三、模型训练方案

### 3.1 环境准备

```bash
# Python 3.10+
pip install torch numpy pandas scikit-learn onnx onnxruntime
pip install matplotlib seaborn  # 可视化
```

### 3.2 模型架构

**推荐：1D-CNN + 全局池化**（比 LSTM 更快、更适合浏览器推理）

```
输入: (batch, 30帧, 99特征)   ← 33关键点×3坐标 = 99维
  ↓
Conv1D(99→128, kernel=3) + ReLU + BatchNorm
  ↓
Conv1D(128→256, kernel=3) + ReLU + BatchNorm  
  ↓
Conv1D(256→128, kernel=3) + ReLU + BatchNorm
  ↓
GlobalAveragePooling1D  → (batch, 128)
  ↓
Dropout(0.3)
  ↓
Dense(128→64) + ReLU
  ↓
Dense(64→5) + Softmax  → [idle, jab, cross, hook, uppercut]
```

**参数量**：约 150K，导出 ONNX 约 600KB。

### 3.3 为什么选 1D-CNN 而不是 LSTM

| | 1D-CNN | LSTM |
|------|--------|------|
| 推理速度 | ⚡ 快 | 🐢 慢（循环结构） |
| ONNX 导出 | ✅ 简单 | ⚠️ 需要处理 hidden state |
| 浏览器推理 | ✅ ONNX Web 直接跑 | ⚠️ 需要 WebAssembly |
| 准确率（30帧） | ~90% | ~92% |
| 模型体积 | ~600KB | ~800KB |

差距 2% 准确率，换推理速度快 3-5 倍。选 CNN。

### 3.4 训练脚本

```python
# train_boxing_model.py

import torch
import torch.nn as nn
import numpy as np
from sklearn.model_selection import train_test_split

# ── 1. 加载数据 ──────────────────────────────────────────

def load_data(data_dir):
    """从 JSON 文件加载关键点序列"""
    X, y = [], []
    label_map = {"idle": 0, "jab": 1, "cross": 2, "hook": 3, "uppercut": 4}
    
    for file in Path(data_dir).glob("*.json"):
        data = json.loads(file.read_text())
        frames = data["frames"][:30]  # 取前30帧
        if len(frames) < 10:
            continue
        
        # 提取 (x,y,z) 坐标，跳过 visibility
        seq = []
        for f in frames:
            coords = []
            for lm in f["landmarks"]:
                coords.extend([lm["x"], lm["y"], lm["z"]])
            seq.append(coords)
        
        # 填充到固定长度
        while len(seq) < 30:
            seq.append(seq[-1])  # 重复最后一帧
        
        X.append(seq)
        y.append(label_map[data["label"]])
    
    return np.array(X), np.array(y)

X, y = load_data("./training_data/")
X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2)

# ── 2. 定义模型 ──────────────────────────────────────────

class BoxingCNN(nn.Module):
    def __init__(self, num_classes=5, input_dim=99):
        super().__init__()
        self.conv1 = nn.Conv1d(input_dim, 128, 3, padding=1)
        self.conv2 = nn.Conv1d(128, 256, 3, padding=1)
        self.conv3 = nn.Conv1d(256, 128, 3, padding=1)
        self.bn1 = nn.BatchNorm1d(128)
        self.bn2 = nn.BatchNorm1d(256)
        self.bn3 = nn.BatchNorm1d(128)
        self.dropout = nn.Dropout(0.3)
        self.fc1 = nn.Linear(128, 64)
        self.fc2 = nn.Linear(64, num_classes)
        self.relu = nn.ReLU()
    
    def forward(self, x):
        # x: (batch, 30, 99) → (batch, 99, 30)
        x = x.permute(0, 2, 1)
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.relu(self.bn3(self.conv3(x)))
        x = x.mean(dim=2)  # GlobalAvgPool
        x = self.dropout(x)
        x = self.relu(self.fc1(x))
        x = self.fc2(x)
        return x

model = BoxingCNN()

# ── 3. 训练 ──────────────────────────────────────────────

criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

for epoch in range(100):
    model.train()
    for batch_X, batch_y in dataloader:
        optimizer.zero_grad()
        output = model(batch_X)
        loss = criterion(output, batch_y)
        loss.backward()
        optimizer.step()
    
    # 验证
    model.eval()
    with torch.no_grad():
        val_output = model(torch.tensor(X_val, dtype=torch.float32))
        val_acc = (val_output.argmax(1) == torch.tensor(y_val)).float().mean()
    
    print(f"Epoch {epoch}: loss={loss.item():.4f}, val_acc={val_acc:.4f}")

# ── 4. 导出 ONNX ─────────────────────────────────────────

dummy_input = torch.randn(1, 30, 99)
torch.onnx.export(
    model, dummy_input, "boxing_model.onnx",
    input_names=["pose_sequence"],
    output_names=["action_probs"],
    dynamic_axes={"pose_sequence": {0: "batch"}},
    opset_version=14,
)
print("✅ Model exported to boxing_model.onnx")
```

---

## 四、浏览器端推理

### 4.1 集成到 Tauri App

```typescript
// src/hooks/useBoxingModel.ts
import * as ort from "onnxruntime-web";

let session: ort.InferenceSession | null = null;

export async function loadModel() {
  session = await ort.InferenceSession.create("/models/boxing_model.onnx");
}

// 缓存最近 30 帧的关键点
const frameBuffer: number[][] = [];

export function predict(landmarks: Landmark[]): string {
  if (!session) return "idle";
  
  // 提取 33×3 = 99 维特征
  const features: number[] = [];
  for (const lm of landmarks) {
    features.push(lm.x, lm.y, lm.z);
  }
  
  frameBuffer.push(features);
  if (frameBuffer.length > 30) frameBuffer.shift();
  if (frameBuffer.length < 30) return "idle";
  
  // 推理
  const input = new ort.Tensor("float32", new Float32Array(frameBuffer.flat()), [1, 30, 99]);
  const output = session.run({ pose_sequence: input });
  const probs = output.action_probs.data as Float32Array;
  
  const labels = ["idle", "jab", "cross", "hook", "uppercut"];
  const maxIdx = probs.indexOf(Math.max(...probs));
  
  return labels[maxIdx];
}
```

### 4.2 替换现有分类器

```typescript
// App.tsx 中替换 classifyBoxingMove
import { predict, loadModel } from "./hooks/useBoxingModel";

// 启动时加载模型
useEffect(() => { loadModel(); }, []);

// onLandmarks 中
const move = predict(currentLandmarks); // 替代 classifyBoxingMove
```

---

## 五、实施步骤（按顺序）

### Step 1：搭建采集工具（30 分钟）

```bash
# 创建独立采集页面
mkdir scripts
touch scripts/collect.html
```

这个页面只需要：
- 一个 `<video>` 显示摄像头
- 一个 `<canvas>` 画骨架
- 5 个按钮对应 5 个动作标签
- 按"开始录制"→做动作→按"停止"→自动保存到 localStorage
- 一个"导出全部数据"按钮，下载为 ZIP

### Step 2：采集数据（1-2 小时）

坐在电脑前，打开 `collect.html`：
1. 点 `idle` → 坐着不动 3 秒 → 停止（重复 10 次）
2. 点 `jab` → 出直拳 → 回位 → 再出（重复 20 次）
3. 点 `cross` → 出交叉拳（重复 15 次）
4. 点 `hook` → 出勾拳（重复 15 次）
5. 点 `uppercut` → 出上勾拳（重复 10 次）
6. 换衣服、换光线 → 再重复一遍
7. 导出 ZIP

### Step 3：训练模型（30 分钟 GPU / 2 小时 CPU）

```bash
pip install torch numpy onnx onnxruntime
python train_boxing_model.py --data ./training_data/ --output boxing_model.onnx
```

### Step 4：集成测试（1 小时）

- 把 `boxing_model.onnx` 放到 `public/models/`
- 集成 `onnxruntime-web` 到项目
- 替换 `classifyBoxingMove` 为模型推理
- 测试：坐着不动 vs 正常出拳

### Step 5：迭代优化

- 如果模型对某类动作准确率低 → 多采集那类数据
- 如果推理太慢 → 减少帧数（30→20）或简化模型
- 如果模型体积太大 → 使用量化（INT8）

---

## 六、关键文件清单

```
BoxingCat/
├── scripts/
│   └── collect.html              # 数据采集工具
├── training/
│   ├── train.py                  # 训练脚本
│   ├── requirements.txt          # pip install -r requirements.txt
│   └── data/                     # 采集的数据
│       ├── jab_001.json
│       ├── idle_001.json
│       └── ...
├── public/
│   └── models/
│       └── boxing_model.onnx     # 训练好的模型
├── src/
│   └── hooks/
│       └── useBoxingModel.ts     # 浏览器推理 hook
```

---

## 七、时间估计

| 阶段 | 时间 |
|------|------|
| 搭建采集工具 | 30 分钟 |
| 采集 200 段数据 | 1-2 小时 |
| 训练模型 | 30 分钟（GPU） |
| 导出 ONNX + 集成 | 1 小时 |
| 测试 + 调优 | 1-2 小时 |
| **总计** | **4-6 小时** |

---

## 八、备选：用现成的姿态动作识别模型

如果想跳过训练，可以调研这些开源方案：

| 项目 | 说明 |
|------|------|
| ST-GCN (MMAction2) | 图卷积动作识别，需要 PyTorch |
| PoseC3D | 3D CNN 姿态动作识别 |
| MediaPipe Solutions | Google 官方有 gesture recognition API |

但这些都不是专门为"拳击"训练的，需要微调。不如自己从零训练 200 段数据来得直接。
