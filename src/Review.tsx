import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Entry, ReviewResult } from "./types";
import { EntryItem } from "./EntryItem";

type Preset = "7d" | "30d" | "all" | "custom";
const DAY = 86400000;

function rangeMs(
  preset: Preset,
  start: string,
  end: string,
): { start_ms: number | null; end_ms: number | null } {
  const now = Date.now();
  if (preset === "7d") return { start_ms: now - 7 * DAY, end_ms: now + 1000 };
  if (preset === "30d") return { start_ms: now - 30 * DAY, end_ms: now + 1000 };
  if (preset === "all") return { start_ms: null, end_ms: null };
  const s = start ? new Date(start + "T00:00:00").getTime() : null;
  const e = end ? new Date(end + "T23:59:59").getTime() + 1000 : null;
  return { start_ms: s, end_ms: e };
}

export function Review() {
  const [preset, setPreset] = useState<Preset>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const debounce = useRef<number | null>(null);

  function reload() {
    const { start_ms, end_ms } = rangeMs(preset, customStart, customEnd);
    invoke<ReviewResult>("review", { start_ms, end_ms, search: appliedSearch || null })
      .then(setResult)
      .catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    const { start_ms, end_ms } = rangeMs(preset, customStart, customEnd);
    invoke<ReviewResult>("review", { start_ms, end_ms, search: appliedSearch || null })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd, appliedSearch]);

  function onSearchChange(v: string) {
    setSearch(v);
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => setAppliedSearch(v), 250);
  }

  const summary = result?.summary;

  return (
    <section className="review">
      <div className="review-controls">
        <div className="presets">
          <button className={"chip" + (preset === "7d" ? " on" : "")} onClick={() => setPreset("7d")}>
            最近 7 天
          </button>
          <button className={"chip" + (preset === "30d" ? " on" : "")} onClick={() => setPreset("30d")}>
            最近 30 天
          </button>
          <button className={"chip" + (preset === "all" ? " on" : "")} onClick={() => setPreset("all")}>
            全部
          </button>
          <button
            className={"chip" + (preset === "custom" ? " on" : "")}
            onClick={() => setPreset("custom")}
          >
            自选
          </button>
        </div>
        {preset === "custom" && (
          <div className="custom-range">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              aria-label="开始日期"
            />
            <span>到</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              aria-label="结束日期"
            />
          </div>
        )}
        <input
          className="search"
          type="search"
          placeholder="搜索过去的记录…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {summary && (
        <div className="stats">
          <span className="stat">
            <b>{summary.count}</b> 条
          </span>
          <span className="stat">
            平均温度 <b>{summary.count ? summary.avg_score.toFixed(1) : "—"}</b>
          </span>
          <span className="dist">
            {summary.distribution.map((d) => (
              <span key={d.score} className="dist-cell" title={`${d.score} 度`}>
                <i className="dist-dot" data-score={d.score} />
                {d.count}
              </span>
            ))}
          </span>
        </div>
      )}

      <ul className="entry-list">
        {result?.entries.map((e: Entry) => (
          <EntryItem key={e.id} entry={e} onChanged={reload} />
        ))}
        {result && result.entries.length === 0 && (
          <li className="empty">这段时间还没留下什么。回到首页写一点？</li>
        )}
      </ul>
    </section>
  );
}
