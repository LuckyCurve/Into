import { useEffect, useState } from "react";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";

export type AutostartAction = "enable" | "disable";

/**
 * 根据当前「开机自启」状态，决定下一次切换的动作与目标状态。
 * 抽成纯函数便于单元测试。
 */
export function decideAutostartAction(current: boolean): {
  action: AutostartAction;
  next: boolean;
} {
  return current
    ? { action: "disable", next: false }
    : { action: "enable", next: true };
}

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * 简单设置面板：目前承载「开机自启」开关。
 * 关闭面板即销毁，避免状态残留。
 */
export function Settings({ open, onClose }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    isEnabled()
      .then((v) => !cancelled && setEnabled(v))
      .catch(() => !cancelled && setEnabled(false))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function toggle() {
    if (loading || busy) return;
    setBusy(true);
    try {
      const { action, next } = decideAutostartAction(enabled);
      if (action === "enable") {
        await enable();
      } else {
        await disable();
      }
      setEnabled(next);
    } catch (e) {
      console.error("切换开机自启失败", e);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <span className="settings-title">设置</span>
          <button className="settings-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-name">开机自启</div>
            <div className="settings-desc">
              登录系统后自动在后台启动（默认隐藏到托盘）
            </div>
          </div>
          <button
            type="button"
            className={"switch" + (enabled ? " on" : "")}
            role="switch"
            aria-checked={enabled}
            aria-label="开机自启"
            disabled={loading || busy}
            onClick={toggle}
          >
            <span className="knob" />
          </button>
        </div>
      </div>
    </div>
  );
}
