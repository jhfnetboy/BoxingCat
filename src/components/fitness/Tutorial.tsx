const TUTORIAL_STEPS = [
  {
    en: "Stand back so your full upper body is visible",
    zh: "后退一步，让上半身完整出现在画面中",
    icon: "🧍",
  },
  {
    en: "Alternate left and right punches toward the camera",
    zh: "左右手交替向摄像头方向出拳",
    icon: "👊",
  },
  {
    en: "Jab: extend arm straight (arm angle > 120°)",
    zh: "直拳：手臂伸直打出（手臂角度 > 120°）",
    icon: "🥊",
  },
  {
    en: "Hook: bent arm + rotate shoulder (arm ~90°)",
    zh: "勾拳：曲臂 + 转肩（手臂约 90° 弯曲）",
    icon: "🪝",
  },
  {
    en: "Every 10 good punches = +1 Cat Food 🍖",
    zh: "每 10 次有效出拳 = +1 猫粮 🍖",
    icon: "🍖",
  },
];

const STICK_FIGURE = `
  o       ← head
 /|\\     ← shoulders (blue dots)
  |       ← spine
 / \\     ← legs

🥊 Jab:     right fist (🔴) shoots forward
🪝 Hook:    right fist curves sideways
⬆️ Uppercut: right fist goes upward
↗️ Slip:    head ducks sideways
`;

export default function Tutorial() {
  return (
    <div className="tutorial-panel">
      <div className="tutorial-title">📖 How to Box / 拳击教程</div>

      {/* Stick figure diagram */}
      <pre className="tutorial-figure">{STICK_FIGURE}</pre>

      {/* Steps */}
      <ol className="tutorial-steps">
        {TUTORIAL_STEPS.map((step, i) => (
          <li key={i}>
            <span className="tutorial-icon">{step.icon}</span>
            <div>
              <div className="tutorial-en">{step.en}</div>
              <div className="tutorial-zh">{step.zh}</div>
            </div>
          </li>
        ))}
      </ol>

      {/* Scoring Table */}
      <div className="tutorial-title" style={{ marginTop: 12 }}>
        📊 Scoring / 计分规则
      </div>
      <table className="scoring-table">
        <thead>
          <tr><th>Move / 动作</th><th>Condition / 条件</th><th>Score / 分数</th></tr>
        </thead>
        <tbody>
          <tr><td>Any punch / 任意出拳</td><td>Wrist vel &gt; 0.02 / 手腕速度&gt;0.02</td><td>40</td></tr>
          <tr><td>Jab / 直拳</td><td>Arm angle &gt; 120° / 手臂角度&gt;120°</td><td>70</td></tr>
          <tr><td>Perfect Jab / 完美直拳</td><td>Arm angle &gt; 150° / 手臂角度&gt;150°</td><td>90</td></tr>
          <tr><td>Hook / 勾拳</td><td>Arm bend ~90° + rotate / 手臂~90°+转身</td><td>70-90</td></tr>
        </tbody>
      </table>
      <p className="tutorial-footer">
        💡 10 quality punches = +1 🍖 Cat Food<br/>
        💡 10 次有效出拳 = +1 🍖 猫粮
      </p>
    </div>
  );
}
