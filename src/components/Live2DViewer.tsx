import { useRef, useEffect, useState } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";

interface Live2DViewerProps {
  modelPath: string;
  width: number;
  height: number;
}

// Ensure PIXI is on window before pixi-live2d-display uses it
(window as any).PIXI = PIXI;

export default function Live2DViewer({ modelPath, width, height }: Live2DViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [msg, setMsg] = useState("init...");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    async function init() {
      try {
        const core = (window as any).Live2DCubismCore;
        if (!core) { setMsg("ERROR: Live2DCubismCore missing"); return; }
        setMsg("PixiJS OK, creating app...");

        const app = new PIXI.Application({
          view: canvas,
          width,
          height,
          backgroundAlpha: 0,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        setMsg(`Loading Rem...`);
        const model = await Live2DModel.from(modelPath, { autoInteract: true });
        if (destroyed) { model.destroy(); return; }

        model.anchor.set(0.5, 0.5);
        model.position.set(width / 2, height / 2);
        const s = Math.min(width / model.width, height / model.height) * 0.8;
        model.scale.set(s);
        app.stage.addChild(model as any);

        model.on("hit", (areas: string[]) => {
          if (areas.includes("body")) model.motion("tap_body");
          if (areas.includes("head")) model.expression();
        });

        setMsg("Rem OK! 👆");
      } catch (e: any) {
        if (!destroyed) setMsg(`ERROR: ${e?.message || String(e)}`);
      }
    }

    init();
    return () => { destroyed = true; };
  }, [modelPath, width, height]);

  return (
    <div style={{ width, height, position: "relative" }}>
      <canvas ref={canvasRef} width={width} height={height} style={{ display: "block" }} />
      <div style={{
        position: "absolute", top: 2, left: 2,
        color: msg.startsWith("ERROR") ? "#e74c3c" : msg.includes("OK") ? "#2ecc71" : "#999",
        fontSize: 10, fontFamily: "monospace", pointerEvents: "none",
      }}>{msg}</div>
    </div>
  );
}
