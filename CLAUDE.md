# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BoxingCat is an AI-powered desktop boxing companion cat: a transparent, always-on-top
desktop pet (Tauri 2 + React 19 + Vite) that watches you shadow-box through the webcam
(MediaPipe Pose) and rewards punches with cat food. Currently on the
`milestone/phase-0-base-framework` branch — base framework only; many features in
`docs/` (blockchain/AAStar accounts, travel, frisbee, backend WS) are planned, not built.

## Commands

Package manager is **pnpm** (never npm).

```bash
./start.sh            # = pnpm tauri dev — the normal way to run the full app
pnpm tauri:dev        # full Tauri app (Rust backend + Vite frontend)
pnpm dev              # Vite frontend only, port 1420 (no Tauri APIs — invoke() calls fail)
pnpm tauri:build      # production DMG/app bundle
pnpm build            # tsc typecheck + vite build (frontend only)

pnpm test             # vitest run
pnpm test path/to/x.test.ts   # single test file
pnpm lint             # eslint src --max-warnings 0
pnpm format           # prettier --write src
```

Note: `lint`/`format`/`test` scripts are wired up but eslint, prettier, and any test
files are **not yet present** in the repo — `pnpm build` (tsc) is the real typecheck gate.

## Architecture

### Multi-window model (the key thing to understand)

The app runs three Tauri windows, created from Rust commands in `src-tauri/src/lib.rs`:

- **`main`** — the floating cat. Renders `App.tsx` (cat branch). Close → hides to Dock
  (does not quit) on macOS; transparent, decorations off, always-on-top, skip-taskbar.
- **`training`** — boxing session UI (camera + pose + HUD + leaderboard). Renders the
  *same* `App.tsx`, but the **training branch**. Opened via `invoke("open_training_window")`.
- **`pet`** — Live2D pet. Loads a **standalone** `public/pet.html` (vanilla JS, not React),
  auto-opened on startup via `invoke("open_pet_window")`.

`App.tsx` decides which UI to render by reading `getCurrentWindow().label` — `"training"`
gets the training panel, everything else gets the cat. There is **one** React entry
(`src/main.tsx` → `App`); the window label is the router. The `pet` window bypasses React
entirely and is its own HTML+JS file.

Rust ↔ frontend bridge: `#[tauri::command]` fns in `lib.rs` (`open_training_window`,
`open_pet_window`, `hide_main_window`, `close_training_window`, `greet`), registered in
`generate_handler!` and gated by `src-tauri/capabilities/default.json`. Adding a new
window command means: write the command, register it, and add any needed
`core:window:*` permission to that capabilities file.

### Pose detection → scoring pipeline (training window)

1. `useCamera` (`src/hooks/useCamera.ts`) → `getUserMedia` stream into a `<video>`.
2. `usePoseDetection` (`src/hooks/usePoseDetection.ts`) → MediaPipe `PoseLandmarker`
   (GPU delegate, VIDEO mode) runs a `requestAnimationFrame` loop, calling back per frame.
   The wasm + `.task` model are fetched from CDNs at runtime (jsdelivr + googleapis) —
   **requires network**, and those hosts are explicitly allow-listed in the Tauri CSP
   (`src-tauri/tauri.conf.json`). No model assets are bundled.
3. `App.tsx` `onLandmarks` does punch detection: a punch needs `MIN_CONSECUTIVE` frames
   of non-idle classification, then a `PUNCH_COOLDOWN`-frame lockout to debounce jitter.
4. `src/utils/pose-classifier.ts` `classifyBoxingMove` classifies jab/cross/hook/uppercut
   from **elbow-angle change rate** (not wrist velocity) — this is deliberate, so head
   turns / standing up / waving don't register as punches. Tune thresholds here
   (`ELBOW_EXTEND_SPEED`, `STRAIGHT_ARM`, hook angle range).

Critical pattern in `onLandmarks`: it's a `useCallback([])` with empty deps, so all
mutable per-frame state (training flag, prev landmarks, punch/cooldown counters,
discovered moves) lives in **refs**, not React state, to avoid stale closures in the
rAF loop. State setters are only called for things that drive rendering. Keep new
per-frame logic on refs and mirror to state sparingly.

### Pet rendering

- **Calico** (`petType: "calico"`): APNG frames in `public/assets/states/`, swapped by
  cat state in `src/components/CatViewer.tsx` (`CALICO_MAP`).
- **Rem** (`petType: "rem"`): Live2D via an `<iframe src="/rem-test.html">`. The `pet`
  window's `pet.html` and `rem-test.html` load Live2D through **global vendor scripts** in
  `public/vendor/` (`live2dcubismcore`, `live2d.min.js`, `pixi.min.js`, `cubism2.min.js`) +
  `pixi-live2d-display` — these are plain `<script>` includes, not npm imports. `index.html`
  also pre-loads `live2dcubismcore.min.js` globally.

### Window dragging

Frameless windows are dragged manually: a drag bar's `mousedown` records the start
position and listens for `mousemove`, calling Tauri `window.setPosition(new
PhysicalPosition(...))`. Implemented twice — in `App.tsx` (main window) and inline in
`pet.html` (pet window). `-webkit-app-region: drag` was tried and abandoned; use the
JS+setPosition approach (see recent commit history).

## Docs & references

- `docs/` — product vision, design, tech research (V1 theory + V2 GitHub-validated),
  milestones. `01-*` is the immutable founder vision; `02-*` design iterates; never
  delete old `03-*` research versions, archive them. Written in Chinese.
- `reference-repos/` — git submodules of ~13 competitor desktop-pet projects analyzed for
  framework choice (bongo-cat-next is the chosen base; clawd-on-desk, oc-claw for backend
  ideas). `nezha-tech-stack/` is extracted Tauri 2 patterns (window mgmt, hooks).
