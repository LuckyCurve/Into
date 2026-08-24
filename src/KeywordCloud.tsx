import { useEffect, useRef, useState } from "react";
import type { Keyword } from "./types";

/** 右键菜单的估算尺寸：只用于把菜单夹回窗口内，误差可忽略。 */
export const MENU_W = 184;
export const MENU_H = 60;

/**
 * 把菜单锚点夹在窗口可见范围内（四周留 8px 边距）。
 * 抽成纯函数便于单元测试；窗口比菜单还小时退到 0。
 */
export function clampMenu(
  x: number,
  y: number,
  winW: number,
  winH: number,
): { x: number; y: number } {
  const maxX = Math.max(0, winW - MENU_W - 8);
  const maxY = Math.max(0, winH - MENU_H - 8);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

interface Props {
  keywords: Keyword[];
  active: string | null;
  onToggle: (term: string) => void;
  /** 右键菜单里确认屏蔽后回调（真正写库与刷新由上层处理）。 */
  onBlock: (term: string) => void;
}

type MenuState = { term: string; x: number; y: number };

export function KeywordCloud({ keywords, active, onToggle, onBlock }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);

  // 菜单打开时：聚焦动作项（键盘可达）；点菜单外或按 Esc 就收起。
  // 点在菜单内部不算「外面」，否则 mousedown 会抢在 click 前把菜单拆掉。
  useEffect(() => {
    if (!menu) return;
    itemRef.current?.focus();
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  if (keywords.length === 0) {
    return (
      <p className="cloud-empty">记录再多一点，反复出现的词会在这里显形。</p>
    );
  }
  const max = keywords[0].count;
  const min = keywords[keywords.length - 1].count;

  function openMenu(e: React.MouseEvent, term: string) {
    e.preventDefault(); // 别弹系统默认的右键菜单
    const pos = clampMenu(
      e.clientX,
      e.clientY,
      window.innerWidth,
      window.innerHeight,
    );
    setMenu({ term, ...pos });
  }

  return (
    <div className="cloud" role="group" aria-label="常提到的词，点击只看相关记录">
      {keywords.map((k) => {
        const t = (k.count - min) / Math.max(1, max - min);
        const size = 14 + t * 12; // 14..26px
        const on = active === k.term;
        return (
          <span className="cloud-item" key={k.term}>
            <button
              type="button"
              className={"cloud-word" + (on ? " on" : "")}
              style={{ fontSize: `${size}px` }}
              aria-pressed={on}
              title="点击筛选相关记录，右键屏蔽这个词"
              onClick={() => onToggle(k.term)}
              onContextMenu={(e) => openMenu(e, k.term)}
            >
              {k.term}
            </button>
          </span>
        );
      })}

      {menu && (
        <div
          ref={menuRef}
          className="cloud-menu"
          role="menu"
          aria-label={`屏蔽「${menu.term}」`}
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            onClick={() => {
              onBlock(menu.term);
              setMenu(null);
            }}
          >
            <span>屏蔽「{menu.term}」</span>
            <span className="cloud-menu-hint">不再出现在常提到的词里</span>
          </button>
        </div>
      )}
    </div>
  );
}
