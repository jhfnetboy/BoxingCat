const STEPS = [
  { text: "Stand back so your full upper body is visible", icon: "🧍" },
  { text: "Alternate left and right punches toward the camera", icon: "👊" },
  { text: "Jab: extend arm straight (elbow angle > 130°)", icon: "🥊" },
  { text: "Hook: bent arm + rotate shoulder (arm ~90°)", icon: "🪝" },
  { text: "Every 10 good punches = +1 Cat Food 🍖", icon: "🍖" },
];

export default function Tutorial() {
  return (
    <div className="tutorial-panel">
      <div className="tutorial-title">📖 How to Box</div>

      <pre className="tutorial-figure">{`
  o       head
 /|\\     shoulders
  |      spine
 / \\     legs

🥊 Jab:  right fist shoots forward
🪝 Hook: right fist curves sideways
⬆️ Uppercut: fist goes upward
↗️ Slip:  head ducks sideways
      `.trim()}</pre>

      <ol className="tutorial-steps">
        {STEPS.map((step, i) => (
          <li key={i}>
            <span className="tutorial-icon">{step.icon}</span>
            <span className="tutorial-en">{step.text}</span>
          </li>
        ))}
      </ol>

      <div className="tutorial-title" style={{ marginTop: 12 }}>📊 Scoring</div>
      <table className="scoring-table">
        <thead><tr><th>Move</th><th>Condition</th><th>Score</th></tr></thead>
        <tbody>
          <tr><td>Any punch</td><td>Elbow extends &gt;5°/frame</td><td>40</td></tr>
          <tr><td>Jab</td><td>Arm angle &gt; 130°</td><td>70</td></tr>
          <tr><td>Perfect Jab</td><td>Arm angle &gt; 150°</td><td>90</td></tr>
          <tr><td>Hook</td><td>Arm bend ~90° + rotate</td><td>70-90</td></tr>
        </tbody>
      </table>
      <p className="tutorial-footer">💡 10 quality punches = +1 🍖 Cat Food</p>
    </div>
  );
}
