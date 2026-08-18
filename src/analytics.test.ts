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
});

