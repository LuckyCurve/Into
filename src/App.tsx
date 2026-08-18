import { useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Capture } from "./Capture";
import { Review } from "./Review";
import { Settings } from "./Settings";
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

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

type View = "capture" | "review";

export default function App() {
  const [view, setView] = useState<View>("capture");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        <button
          className="win-btn gear"
          aria-label="设置"
          onClick={() => setSettingsOpen(true)}
        >
          <GearIcon />
        </button>
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
            aria-label="隐藏到托盘"
            title="隐藏到托盘"
            onClick={() => void getCurrentWindow().hide()}
          >
            ×
          </button>
        </div>
      </header>

      <main className="stage">
        {view === "capture" ? <Capture /> : <Review />}
      </main>

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
