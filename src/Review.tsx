import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Entry, ReviewResult } from "./types";
import { EntryItem } from "./EntryItem";
import {
  temperatureSeries,
  calendarCells,
} from "./analytics";
import { TemperatureStream } from "./TemperatureStream";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { ScoreSpread } from "./ScoreSpread";
import { KeywordCloud } from "./KeywordCloud";

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
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const { start_ms, end_ms } = rangeMs(preset, customStart, customEnd);
    invoke<ReviewResult>("review", {
      start_ms,
      end_ms,
      search: appliedSearch || null,
    })
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

  function reload() {
    const { start_ms, end_ms } = rangeMs(preset, customStart, customEnd);
    invoke<ReviewResult>("review", {
      start_ms,
      end_ms,
      search: appliedSearch || null,
    })
      .then(setResult)
      .catch(() => {});
  }

  // 数据在别处（如设置面板）被改动后，刷新当前浏览
  useEffect(() => {
    const onChanged = () => reload();
    window.addEventListener("into:entries-changed", onChanged);
    return () => window.removeEventListener("into:entries-changed", onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd, appliedSearch]);

  const entries = result?.entries ?? [];
  const summary = result?.summary;

  const series = useMemo(() => temperatureSeries(entries), [entries]);
  const heat = useMemo(() => calendarCells(entries), [entries]);
  const keywords = result?.keywords ?? [];

  const filtered = useMemo(
    () =>
      activeKeyword
        ? entries.filter((e) =>
            e.content.toLowerCase().includes(activeKeyword.toLowerCase()),
          )
        : entries,
    [entries, activeKeyword],
  );

  function toggleKeyword(term: string) {
    setActiveKeyword((prev) => (prev === term ? null : term));
  }

  async function blockTerm(term: string) {
    try {
      await invoke("block_keyword", { term });
      if (activeKeyword === term) setActiveKeyword(null);
      reload();
    } catch {
      // 忽略：屏蔽失败不应打断浏览
    }
  }

  return (
    <section className="review">
      <div className="review-controls">
        <div className="presets">
          <button
            className={"chip" + (preset === "7d" ? " on" : "")}
            onClick={() => setPreset("7d")}
          >
            最近 7 天
          </button>
          <button
            className={"chip" + (preset === "30d" ? " on" : "")}
            onClick={() => setPreset("30d")}
          >
            最近 30 天
          </button>
          <button
            className={"chip" + (preset === "all" ? " on" : "")}
            onClick={() => setPreset("all")}
          >
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

      {entries.length === 0 ? (
        <p className="empty">
          {appliedSearch
            ? "没有匹配的记录。"
            : "这段时间还没留下什么。回到首页写一点？"}
        </p>
      ) : (
        <>
          <section className="panel">
            <header className="panel-head">
              <h3 className="panel-title">最近的温度</h3>
              <p className="panel-sub">每天的平均温度，连成你心里的起伏</p>
            </header>
            <TemperatureStream buckets={series} />
          </section>

          <section className="panel">
            <header className="panel-head">
              <h3 className="panel-title">你愿意记录的时刻</h3>
              <p className="panel-sub">颜色越深，那天写得越多</p>
            </header>
            <CalendarHeatmap cells={heat} />
          </section>

          <section className="panel">
            <header className="panel-head">
              <h3 className="panel-title">温度的切面</h3>
              <p className="panel-sub">不是打分，是你心的分布</p>
            </header>
            {summary && (
              <ScoreSpread distribution={summary.distribution} entries={entries} />
            )}
          </section>

          <section className="panel">
            <header className="panel-head">
              <h3 className="panel-title">你最近常提到</h3>
              <p className="panel-sub">
                反复出现的，才是兴趣。点一个词，看看相关记录
              </p>
            </header>
            <KeywordCloud
              keywords={keywords}
              active={activeKeyword}
              onToggle={toggleKeyword}
              onBlock={blockTerm}
            />
          </section>

          {activeKeyword && (
            <div className="filter-chip">
              筛选：<b>{activeKeyword}</b>
              <button
                type="button"
                className="filter-clear"
                onClick={() => setActiveKeyword(null)}
                aria-label="取消筛选"
              >
                ✕
              </button>
            </div>
          )}

          <ul className="entry-list">
            {filtered.map((e: Entry) => (
              <EntryItem
                key={e.id}
                entry={e}
                highlight={activeKeyword ?? undefined}
                onChanged={reload}
              />
            ))}
            {filtered.length === 0 && (
              <li className="empty">没有包含「{activeKeyword}」的记录。</li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
