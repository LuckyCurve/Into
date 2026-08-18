import type { Entry } from "./types";

export const DAY_MS = 86_400_000;

export interface DayBucket {
  ts: number; // 桶起点（本地时间）
  avg: number; // 桶内平均温度，空桶为 0
  count: number;
}

export interface HeatCell {
  ts: number; // 当日本地零点
  count: number;
  weekIndex: number; // 第几周（列）
  weekday: number; // 0=周一 … 6=周日
}

// ---------- 本地时间辅助 ----------
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts: number): number {
  const d = startOfDay(ts);
  const dow = (new Date(d).getDay() + 6) % 7; // 周一=0
  return d - dow * DAY_MS;
}

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 按时间跨度自适应桶大小：短用日、中用周、长用月
function pickBucket(start: number, end: number): {
  size: number;
  floor: (t: number) => number;
} {
  const days = (end - start) / DAY_MS;
  if (days <= 45) return { size: DAY_MS, floor: startOfDay };
  if (days <= 365) return { size: 7 * DAY_MS, floor: startOfWeek };
  return { size: 30 * DAY_MS, floor: startOfMonth };
}

function nextBoundary(t: number, size: number, floor: (x: number) => number): number {
  if (size === 30 * DAY_MS) {
    const d = new Date(floor(t));
    d.setMonth(d.getMonth() + 1);
    return d.getTime();
  }
  return floor(t) + size;
}

/** 把条目聚合成「温度随时间」的桶序列。空桶也会占位（avg=0），让曲线能呈现沉默。 */
export function temperatureSeries(entries: Entry[]): DayBucket[] {
  if (entries.length === 0) return [];
  const times = entries.map((e) => e.created_at);
  const { size, floor } = pickBucket(Math.min(...times), Math.max(...times));
  const start = floor(Math.min(...times));
  const end = floor(Math.max(...times));

  const acc = new Map<number, { s: number; c: number }>();
  for (let t = start; t <= end; t = nextBoundary(t, size, floor)) {
    acc.set(t, { s: 0, c: 0 });
  }
  for (const e of entries) {
    const k = floor(e.created_at);
    const b = acc.get(k) ?? { s: 0, c: 0 };
    b.s += e.score;
    b.c += 1;
    acc.set(k, b);
  }

  const out: DayBucket[] = [];
  for (let t = start; t <= end; t = nextBoundary(t, size, floor)) {
    const b = acc.get(t)!;
    out.push({ ts: t, count: b.c, avg: b.c ? b.s / b.c : 0 });
  }
  return out;
}

/** 逐日密度，按周分列（GitHub 式热力图用）。 */
export function calendarCells(entries: Entry[]): HeatCell[] {
  if (entries.length === 0) return [];
  const times = entries.map((e) => e.created_at);
  const start = startOfWeek(Math.min(...times));
  const endDay = startOfDay(Math.max(...times));

  const counts = new Map<number, number>();
  for (const e of entries) {
    const d = startOfDay(e.created_at);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  const cells: HeatCell[] = [];
  for (let t = start; t <= endDay; t += DAY_MS) {
    const dow = (new Date(t).getDay() + 6) % 7;
    const weekIndex = Math.floor((t - start) / (7 * DAY_MS));
    cells.push({ ts: t, count: counts.get(t) ?? 0, weekIndex, weekday: dow });
  }
  return cells;
}
