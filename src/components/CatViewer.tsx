import { useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface CatViewerProps {
  state: "idle" | "walking" | "sleeping" | "excited" | "training";
  petType: "calico" | "dancer" | "rem";
  onClick: () => void;
  message: string;
}

const CALICO_MAP: Record<string, string> = {
  idle: "/assets/states/calico-idle.apng",
  walking: "/assets/states/calico-idle.apng",
  sleeping: "/assets/states/calico-sleeping.apng",
  excited: "/assets/states/calico-happy.apng",
  training: "/assets/states/calico-thinking.apng",
};

export const PET_LABELS: Record<string, string> = {
  calico: "🐱 Calico APNG",
  dancer: "💃 Dancer 帧动画",
  rem: "💙 Rem Live2D",
};

export default function CatViewer({ state, petType, onClick, message }: CatViewerProps) {
  const [imgKey, setImgKey] = useState(0);

  const isRem = petType === "rem";
  const isDancer = petType === "dancer";
  const petSrc = CALICO_MAP[state] || "/assets/states/calico-idle.apng";

  const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
    // Let the OS start window drag on this element
    try { await getCurrentWindow().startDragging(); } catch (_) {}
  }, []);

  return (
    <div className="cat-container" onClick={onClick} onMouseDown={handleMouseDown} style={{ cursor: "grab" }}>
      <div
        style={{
          width: 266,
          height: 200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isRem ? (
          <iframe src="/rem-test.html" style={{ width: 300, height: 450, border: "none", background: "transparent" }} title="Rem" />
        ) : isDancer ? (
          <div className="dancer-sprite" style={{ width: 128, height: 128, position: "relative" }}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <img
                key={i}
                src={`/assets/states/codepet-dancer-f${i}.png`}
                alt="dancer"
                style={{
                  position: "absolute",
                  width: 128,
                  height: 128,
                  imageRendering: "pixelated",
                  opacity: 0,
                  animation: `dancerFrames 1.8s steps(1) ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        ) : (
          <img
            key={imgKey}
            src={petSrc}
            alt="Calico"
            style={{ width: 266, height: 200, imageRendering: "pixelated" }}
          />
        )}
      </div>
      <div className="cat-speech-bubble">{message}</div>
      <style>{`
        @keyframes dancerFrames {
          0%, 100% { opacity: 0; }
          11.1%, 22.2% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
