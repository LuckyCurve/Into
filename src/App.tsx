import { useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Capture } from "./Capture";
import { Review } from "./Review";
import "./App.css";

type ResizeDir =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

const EDGES: { dir: ResizeDir; cls: string }[] = [
  { dir: "North", cls: "rh-top" },
  { dir: "South", cls: "rh-bottom" },
  { dir: "West", cls: "rh-left" },
  { dir: "East", cls: "rh-right" },
  { dir: "NorthWest", cls: "rh-nw" },
  { dir: "NorthEast", cls: "rh-ne" },
  { dir: "SouthWest", cls: "rh-sw" },
  { dir: "SouthEast", cls: "rh-se" },
];

function startResize(e: MouseEvent, dir: ResizeDir) {
  e.preventDefault();
  void getCurrentWindow().startResizeDragging(dir);
}

function startDrag(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest("button")) return;
  e.preventDefault();
  void getCurrentWindow().startDragging();
}

type View = "capture" | "review";

export default function App() {
  const [view, setView] = useState<View>("capture");
  return (
    <div className="app">
      <div className="resize-frame" />
      {EDGES.map(({ dir, cls }) => (
        <div key={cls} className={"rh " + cls} onMouseDown={(e) => startResize(e, dir)} />
      ))}

      <header className="topbar" onMouseDown={startDrag}>
        <span className="brand">
          Into · 最近
        </span>
        <div className="drag-spacer" />
        <nav className="tabs">
          <button
            className={"tab" + (view === "capture" ? " on" : "")}
            onClick={() => setView("capture")}
          >
            写一点
          </button>
          <button
            className={"tab" + (view === "review" ? " on" : "")}
            onClick={() => setView("review")}
          >
            看看
          </button>
        </nav>
        <div className="window-controls">
          <button
            className="win-btn"
            aria-label="最小化"
            onClick={() => void getCurrentWindow().minimize()}
          >
            –
          </button>
          <button
            className="win-btn close"
            aria-label="关闭"
            onClick={() => void getCurrentWindow().close()}
          >
            ×
          </button>
        </div>
      </header>

      <main className="stage">
        {view === "capture" ? <Capture /> : <Review />}
      </main>
    </div>
  );
}
