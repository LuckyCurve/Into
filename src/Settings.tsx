import { useEffect, useRef, useState } from "react";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import type { DbStats } from "./types";

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
  onCheckUpdate?: () => void;
  checkingUpdate?: boolean;
  hasUpdate?: boolean;
};

/**
 * 简单设置面板：目前承载「开机自启」开关。
 * 关闭面板即销毁，避免状态残留。
 */
export function Settings({
  open,
  onClose,
  version,
  onCheckUpdate,
  checkingUpdate,
  hasUpdate,
}: Props) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [newTerm, setNewTerm] = useState("");
  // 数据库记录构成：用于驱动「生成 / 清理示例数据」按钮的可用状态。
  const [stats, setStats] = useState<DbStats | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 读取数据库记录构成（总 / 示例 / 真实 + 是否可清示例）。
  function loadStats() {
    invoke<DbStats>("db_stats")
      .then(setStats)
      .catch((e) => console.error("读取数据库统计失败", e));
  }

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
    if (!cancelled) loadStats();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 打开时把焦点移进面板（关闭按钮），Esc 直接关面板；关闭即清理监听。
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

  // 数据库为空（且已确认统计）时才允许生成示例数据；
  // 一旦已有任何记录、或统计尚未加载/加载失败（stats 为 null），一律禁止——默认走安全态。
  const generateDisabled = stats == null || stats.total > 0;
  // 仅当「全部都是示例数据」时才允许清理；混入真实记录、无示例或统计未就绪时禁用。
  const canClearSample = stats?.can_clear_sample ?? false;

  async function generateSamples() {
    if (generating || generateDisabled) return;
    setGenerating(true);
    try {
      await invoke("generate_test_data");
      window.dispatchEvent(new Event("into:entries-changed"));
      loadStats();
    } catch (e) {
      console.error("生成示例数据失败", e);
    } finally {
      setGenerating(false);
      setConfirmGenerate(false);
    }
  }

  async function clearSample() {
    if (clearing || !canClearSample) return;
    setClearing(true);
    try {
      await invoke("clear_sample_data");
      window.dispatchEvent(new Event("into:entries-changed"));
      loadStats();
    } catch (e) {
      console.error("清理示例数据失败", e);
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
          <button
            ref={closeRef}
            className="settings-close"
            aria-label="关闭"
            onClick={onClose}
          >
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
              {generateDisabled
                ? "数据库已有记录，无法再生成示例（可先清理示例数据）"
                : "插入一批本地示例记录，用于预览分析效果（不含你的真实数据）"}
            </div>
          </div>
          {confirmGenerate ? (
            <div className="settings-actions">
              <button
                type="button"
                className="ghost danger"
                disabled={generating || generateDisabled}
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
              disabled={generateDisabled}
              title={generateDisabled ? "数据库已有记录，无法生成示例数据" : ""}
              onClick={() => setConfirmGenerate(true)}
            >
              生成示例数据
            </button>
          )}
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-name">清理示例数据</div>
            <div className="settings-desc">
              {canClearSample
                ? "删除全部示例数据（不可恢复；保留你的屏蔽词偏好）"
                : stats && stats.real > 0
                ? "数据库里混入了真实记录，不能一键清理示例数据"
                : "当前没有示例数据可清理"}
            </div>
          </div>
          {confirmClear ? (
            <div className="settings-actions">
              <button
                type="button"
                className="ghost danger"
                disabled={clearing || !canClearSample}
                onClick={clearSample}
              >
                {clearing ? "清空中…" : "确认清理？"}
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
              disabled={!canClearSample}
              title={!canClearSample ? "仅当数据库全部是示例数据时才可清理" : ""}
              onClick={() => setConfirmClear(true)}
            >
              清理示例数据
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
        <div className="settings-section-title">关于</div>
        <div className="settings-row">
          <div className="settings-label">
            <div className="settings-name">检查更新</div>
            <div className="settings-desc">
              {hasUpdate ? "发现新版本，建议更新" : "已是最新"}
            </div>
          </div>
          <button
            type="button"
            className="ghost"
            onClick={onCheckUpdate}
            disabled={checkingUpdate}
          >
            {checkingUpdate ? "检查中…" : "检查更新"}
          </button>
        </div>
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
