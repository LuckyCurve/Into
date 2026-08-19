import { useEffect, useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { Capture } from "./Capture";
import { Review } from "./Review";
import { Settings } from "./Settings";
import type { UpdateInfo } from "./types";
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

function MaximizeIcon({ maximized }: { maximized: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {maximized ? (
        <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
      ) : (
        <rect x="4" y="4" width="16" height="16" rx="1.5" />
      )}
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={spinning ? "spin" : undefined}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

type View = "capture" | "review";

export default function App() {
  const [view, setView] = useState<View>("capture");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMax, setIsMax] = useState(false);
  const [version, setVersion] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<
    { kind: "ok" | "info" | "error"; msg: string } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentWindow()
      .isMaximized()
      .then((m) => !cancelled && setIsMax(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 启动静默检查一次更新：失败（断网 / 限流等）一律忽略，不打扰用户。
  useEffect(() => {
    let cancelled = false;
    invoke<UpdateInfo>("check_update")
      .then((info) => {
        if (!cancelled && info.has_update) setUpdateInfo(info);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 取当前版本号，仅用于设置页展示。
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  // toast 自动消失。
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function showToast(kind: "ok" | "info" | "error", msg: string) {
    setToast({ kind, msg });
  }

  // 手动检查：失败要给出具体错误；无更新则提示已是最新。
  async function manualCheck() {
    if (checking) return;
    setChecking(true);
    try {
      const info = await invoke<UpdateInfo>("check_update");
      setUpdateInfo(info);
      if (info.has_update) {
        showToast("info", `发现新版本 v${info.latest}`);
      } else {
        showToast("ok", "已经是最新版本");
      }
    } catch (e) {
      showToast("error", `检查更新失败：${String(e)}`);
    } finally {
      setChecking(false);
    }
  }

  // 点击 New 标记：打开 Release 页（标记本身不消失，留到你真更新）。
  function openRelease() {
    const url = updateInfo?.url;
    if (!url) return;
    invoke("open_release_page", { url }).catch((e) =>
      showToast("error", `打开失败：${String(e)}`),
    );
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // 焦点在可编辑元素（输入文字 / 下拉等）内时，Tab 保持默认行为（在表单中移动焦点），不拦截
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) {
        return;
      }
      e.preventDefault();
      setView((v) => (v === "capture" ? "review" : "capture"));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleMaximize() {
    const w = getCurrentWindow();
    w.toggleMaximize()
      .then(() => w.isMaximized())
      .then(setIsMax)
      .catch(() => {});
  }

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
        {updateInfo?.has_update && (
          <button
            className="update-badge"
            onClick={openRelease}
            title={`发现新版本 v${updateInfo.latest}，点击前往 GitHub 查看`}
          >
            New
          </button>
        )}
        <div className="drag-spacer" />
        <nav
          className="tabs"
          title="按 Tab 在「写一点」和「看看」之间切换"
          aria-keyshortcuts="Tab"
        >
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
          <span className="tab-hint" aria-hidden="true">Tab ⇄</span>
        </nav>
        <button
          className="win-btn gear"
          aria-label="设置"
          onClick={() => setSettingsOpen(true)}
        >
          <GearIcon />
        </button>
        <button
          className="win-btn check-update"
          aria-label="检查更新"
          title="检查更新"
          onClick={manualCheck}
          disabled={checking}
        >
          <RefreshIcon spinning={checking} />
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
            className="win-btn"
            aria-label={isMax ? "还原窗口" : "最大化"}
            aria-pressed={isMax}
            onClick={toggleMaximize}
          >
            <MaximizeIcon maximized={isMax} />
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

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        version={version}
      />
      {toast && (
        <div
          className={`toast toast-${toast.kind}`}
          role="status"
          onClick={() => setToast(null)}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
