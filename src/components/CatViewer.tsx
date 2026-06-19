import { useRef, useEffect, useState } from "react";

interface CatViewerProps {
  state: "idle" | "walking" | "sleeping" | "excited" | "training";
  petType: "calico" | "dancer";
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

const PET_LABELS: Record<string, string> = {
  calico: "🐱 Calico APNG",
  dancer: "💃 Dancer 帧动画",
};

export default function CatViewer({ state, petType, onClick, message }: CatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgKey, setImgKey] = useState(0);

  useEffect(() => {
    setImgKey((k) => k + 1);
  }, [petType]);

  const isDancer = petType === "dancer";
  const petSrc = CALICO_MAP[state] || "/assets/states/calico-idle.apng";

  return (
    <div ref={containerRef} className="cat-container" onClick={onClick}>
      <div style={{ width: 266, height: 200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isDancer ? (
          <div className="dancer-sprite" style={{ width: 128, height: 128, position: "relative" }}>
            {[0,1,2,3,4,5,6,7,8].map((i) => (
              <img
                key={i}
                src={`/assets/states/codepet-dancer-f${i}.png`}
                alt="dancer"
                style={{
                  position: "absolute", width: 128, height: 128, imageRendering: "pixelated",
                  opacity: 0,
                  animation: `dancerFrames 1.8s steps(1) ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        ) : (
          <img key={imgKey} src={petSrc} alt="Calico" style={{ width: 266, height: 200, imageRendering: "pixelated" }} />
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

export { PET_LABELS };
