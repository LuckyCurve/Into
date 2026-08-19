import { useEffect, useState } from "react";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";

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
  version?: string;
};

/**
 * 简单设置面板：目前承载「开机自启」开关。
 * 关闭面板即销毁，避免状态残留。
 */
export function Settings({ open, onClose, version }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [newTerm, setNewTerm] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    isEnabled()
      .then((v) => !cancelled && setEnabled(v))
      .catch(() => !cancelled && setEnabled(false))
      .finally(() => !cancelled && setLoading(false));
    invoke<string[]>("list_blocked_terms")
      .then((list) => !cancelled && setBlocked(list))
      .catch(() => {});
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

  async function generateSamples() {
    if (generating) return;
    setGenerating(true);
    try {
      await invoke("generate_test_data");
      window.dispatchEvent(new Event("into:entries-changed"));
    } catch (e) {
      console.error("生成示例数据失败", e);
    } finally {
      setGenerating(false);
      setConfirmGenerate(false);
    }
  }

  async function clearAll() {
    if (clearing) return;
    setClearing(true);
    try {
      await invoke("clear_all_entries");
      window.dispatchEvent(new Event("into:entries-changed"));
    } catch (e) {
      console.error("清空失败", e);
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  async function addBlocked() {
    const term = newTerm.trim();
    if (!term) return;
    try {
      await invoke("block_keyword", { term });
      setNewTerm("");
      const list = await invoke<string[]>("list_blocked_terms");
      setBlocked(list);
      window.dispatchEvent(new Event("into:entries-changed"));
    } catch (e) {
      console.error("屏蔽词失败", e);
    }
  }

  async function removeBlocked(term: string) {
    try {
      await invoke("unblock_keyword", { term });
      setBlocked((prev) => prev.filter((t) => t !== term));
      window.dispatchEvent(new Event("into:entries-changed"));
    } catch (e) {
      console.error("解除屏蔽失败", e);
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

        <div className="settings-divider" />
        <div className="settings-section-title">数据</div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-name">生成示例数据</div>
            <div className="settings-desc">
              插入一批本地示例记录，用于预览分析效果（不含你的真实数据）
            </div>
          </div>
          {confirmGenerate ? (
            <div className="settings-actions">
              <button
                type="button"
                className="ghost danger"
                disabled={generating}
                onClick={generateSamples}
              >
                {generating ? "生成中…" : "确认生成？"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setConfirmGenerate(false)}
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ghost"
              onClick={() => setConfirmGenerate(true)}
            >
              生成示例数据
            </button>
          )}
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-name">清空全部</div>
            <div className="settings-desc">
              删除全部记录（不可恢复；保留你的屏蔽词偏好）
            </div>
          </div>
          {confirmClear ? (
            <div className="settings-actions">
              <button
                type="button"
                className="ghost danger"
                disabled={clearing}
                onClick={clearAll}
              >
                {clearing ? "清空中…" : "确认清空？"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setConfirmClear(false)}
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ghost danger"
              onClick={() => setConfirmClear(true)}
            >
              清空全部
            </button>
          )}
        </div>

        <div className="settings-divider" />
        <div className="settings-section-title">屏蔽的词</div>
        <div className="settings-blocked">
          <div className="blocked-row">
            <input
              className="blocked-input"
              type="text"
              placeholder="屏蔽一个词（不再出现在关键词里）"
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addBlocked();
              }}
              aria-label="要屏蔽的词"
            />
            <button
              type="button"
              className="ghost"
              disabled={newTerm.trim().length === 0}
              onClick={addBlocked}
            >
              屏蔽
            </button>
          </div>
          {blocked.length === 0 ? (
            <p className="blocked-empty">还没有屏蔽的词。</p>
          ) : (
            <div className="blocked-list">
              {blocked.map((term) => (
                <span className="blocked-chip" key={term}>
                  {term}
                  <button
                    type="button"
                    aria-label={`解除屏蔽「${term}」`}
                    onClick={() => removeBlocked(term)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="settings-divider" />
        <div className="settings-about">
          <div className="settings-name">Into · 兴趣雷达</div>
          <div className="settings-desc">
            版本 v{version || "…"} · 数据全部留在本地
          </div>
        </div>
      </div>
    </div>
  );
}
