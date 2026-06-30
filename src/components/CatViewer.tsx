import { useState } from "react";

type PetType = "calico" | "rem" | "tororo" | "hijiki";

interface CatViewerProps {
  state: "idle" | "walking" | "sleeping" | "excited" | "training";
  petType: PetType;
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

// Live2D 宠物 → 模型 model.json 路径(都走通用 viewer /live2d.html)
const LIVE2D_MODELS: Partial<Record<PetType, string>> = {
  rem: "/assets/live2d/rem/rem.model.json",
  tororo: "/assets/live2d/tororo/tororo.model.json",
  hijiki: "/assets/live2d/hijiki/hijiki.model.json",
};

export const PET_LABELS: Record<string, string> = {
  calico: "🐱 Calico APNG",
  rem: "💙 Rem Live2D",
  tororo: "🤍 Tororo 猫",
  hijiki: "🖤 Hijiki 猫",
};

export default function CatViewer({ state, petType, onClick, message }: CatViewerProps) {
  const [imgKey] = useState(0);

  const live2dModel = LIVE2D_MODELS[petType];
  const petSrc = CALICO_MAP[state] || "/assets/states/calico-idle.apng";

  return (
    <div className="cat-container" onClick={onClick}>
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
        {live2dModel ? (
          <iframe
            src={`/live2d.html?model=${encodeURIComponent(live2dModel)}`}
            style={{ width: 300, height: 450, border: "none", background: "transparent" }}
            title={petType}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <img
            key={imgKey}
            src={petSrc}
            alt="Calico"
            draggable="false"
            style={{ width: 266, height: 200, imageRendering: "pixelated", userSelect: "none" }}
          />
        )}
      </div>
      <div className="cat-speech-bubble">{message}</div>
    </div>
  );
}
