import { describe, it, expect } from "vitest";
import type { Entry } from "./types";
import { temperatureSeries } from "./analytics";

function e(content: string, score: number, at: number): Entry {
  return { id: 0, content, score, created_at: at, updated_at: null };
}

const DAY = 86_400_000;
const mid = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe("temperatureSeries", () => {
  it("空数据返回空数组", () => {
    expect(temperatureSeries([])).toEqual([]);
  });

  it("同一天的多条按平均聚合", () => {
    const t = mid(2024, 1, 10);
    const buckets = temperatureSeries([e("a", 2, t), e("b", 4, t + 1000)]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(2);
    expect(buckets[0].avg).toBe(3);
  });

  it("跨多天生成每日桶并保留沉默日", () => {
    const t = mid(2024, 1, 10);
    const buckets = temperatureSeries([
      e("a", 5, t),
      e("b", 3, t + DAY),
      e("c", 1, t + 3 * DAY),
    ]);
    expect(buckets).toHaveLength(4); // 10,11,12,13
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 0, 1]);
    expect(buckets[2].avg).toBe(0); // 沉默日
    expect(buckets[0].avg).toBe(5);
  });

  it("跨度超过 45 天时用周桶，且每个桶起点都对齐本地周一零点", () => {
    // 2024-01-10（周三）到 2024-03-22（周五），约 72 天 → 走周桶档位。
    const t0 = mid(2024, 1, 10);
    const t1 = mid(2024, 3, 22);
    const buckets = temperatureSeries([e("a", 4, t0), e("b", 2, t1)]);
    expect(buckets.length).toBeGreaterThan(2);
    for (const b of buckets) {
      const d = new Date(b.ts);
      expect(d.getDay()).toBe(1); // 周一
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    }
    // 条目必须落进有数据的桶里：首尾桶各含一条。
    expect(buckets[0].count).toBe(1);
    expect(buckets[buckets.length - 1].count).toBe(1);
  });

  it("跨度超过一年时用月桶，每个桶起点都是当月 1 日零点且条目命中所在桶", () => {
    const t0 = mid(2023, 1, 15);
    const t1 = mid(2024, 5, 3);
    const buckets = temperatureSeries([e("a", 3, t0), e("b", 5, t1)]);
    expect(buckets.length).toBe(17); // 2023-01 .. 2024-05
    for (const b of buckets) {
      const d = new Date(b.ts);
      expect(d.getDate()).toBe(1);
      expect(d.getHours()).toBe(0);
    }
    expect(buckets[0].count).toBe(1);
    expect(buckets[16].count).toBe(1);
  });

  it("每条记录都能命中一个已预置的桶（聚合 key 与桶 key 一致）", () => {
    // 这是不变量级测试：任何输入下都不应出现「记录被算进了一个序列外的幽灵桶」。
    const times = [
      mid(2024, 2, 28),
      mid(2024, 2, 29), // 闰日
      mid(2024, 3, 1),
      mid(2024, 12, 31),
    ];
    const entries = times.map((t, i) => e(`x${i}`, ((i % 5) + 1) as number, t));
    const buckets = temperatureSeries(entries);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(times.length);
    // ts 严格递增且无重复桶
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].ts).toBeGreaterThan(buckets[i - 1].ts);
    }
  });
});

