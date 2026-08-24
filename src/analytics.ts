import type { Entry } from "./types";

export const DAY_MS = 86_400_000;

export interface DayBucket {
  ts: number; // 桶起点（本地时间）
  avg: number; // 桶内平均温度，空桶为 0
  count: number;
}

// ---------- 本地时间辅助 ----------
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  // 日历回退而非毫秒减法：跨夏令时切换的一周里，
  // 毫秒回退会让结果偏离周一零点。
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 周一=0
  return d.getTime();
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

/**
 * 求下一个桶的起点。必须用日历运算（setDate / setMonth）推进，
 * 而不是在毫秒上加减 DAY_MS：夏令时时区里一天可能只有 23 或 25 小时，
 * 毫秒累加会让桶起点偏离真正的零点，与条目聚合用的 floor key 对不上，
 * 导致当天的记录从序列里消失。
 */
function nextBoundary(t: number, size: number, floor: (x: number) => number): number {
  const d = new Date(floor(t));
  if (size === 30 * DAY_MS) d.setMonth(d.getMonth() + 1);
  else if (size === 7 * DAY_MS) d.setDate(d.getDate() + 7);
  else d.setDate(d.getDate() + 1);
  return d.getTime();
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
