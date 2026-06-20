import { useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface CatViewerProps {
  state: "idle" | "walking" | "sleeping" | "excited" | "training";
  petType: "calico" | "rem";
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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Must be called synchronously during the event
    getCurrentWindow().startDragging();
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
    </div>
  );
}
