import { describe, it, expect } from "vitest";
import { catmullRomToBezier, generateSmoothPath } from "./curve";

describe("catmullRomToBezier", () => {
  it("生成正确的 SVG C 命令格式", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 10, y: 20 };
    const p2 = { x: 30, y: 10 };
    const p3 = { x: 40, y: 30 };

    const result = catmullRomToBezier(p0, p1, p2, p3);

    // 应该以 C 开头
    expect(result).toMatch(/^C/);
    // 应该包含三组坐标（控制点1、控制点2、终点）
    expect(result).toContain(",");
    // 终点应该是 p2
    expect(result).toContain("30.00,10.00");
  });

  it("tension 参数影响控制点位置", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 10, y: 20 };
    const p2 = { x: 30, y: 10 };
    const p3 = { x: 40, y: 30 };

    const low = catmullRomToBezier(p0, p1, p2, p3, 0.3);
    const high = catmullRomToBezier(p0, p1, p2, p3, 0.7);

    // 不同 tension 应该产生不同的路径
    expect(low).not.toBe(high);
  });

  it("控制点保持曲线平滑", () => {
    // 四个点在一条直线上
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 10, y: 10 };
    const p2 = { x: 20, y: 20 };
    const p3 = { x: 30, y: 30 };

    const result = catmullRomToBezier(p0, p1, p2, p3);
    const match = result.match(/C([\d.]+),([\d.]+) ([\d.]+),([\d.]+) ([\d.]+),([\d.]+)/);

    expect(match).toBeTruthy();
    if (match) {
      const [, cp1x, cp1y, cp2x, cp2y, ex, ey] = match;
      // 控制点应该在合理范围内
      expect(Number(cp1x)).toBeGreaterThan(0);
      expect(Number(cp1x)).toBeLessThan(30);
      expect(Number(cp2x)).toBeGreaterThan(0);
      expect(Number(cp2x)).toBeLessThan(30);
      // 终点应该是 p2
      expect(Number(ex)).toBe(20);
      expect(Number(ey)).toBe(20);
    }
  });
});

describe("generateSmoothPath", () => {
  it("空数组返回空字符串", () => {
    expect(generateSmoothPath([])).toBe("");
  });

  it("单点返回 M 命令", () => {
    const result = generateSmoothPath([{ x: 10, y: 20 }]);
    expect(result).toBe("M10.00,20.00");
  });

  it("两点返回平滑曲线（C 命令），不是直线（L 命令）", () => {
    const result = generateSmoothPath([
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ]);

    // 应该以 M 开头
    expect(result).toMatch(/^M/);
    // 应该包含 C 命令（贝塞尔曲线），不是 L 命令（直线）
    expect(result).toContain("C");
    expect(result).not.toContain(" L");
    // 终点应该是 (100, 50)
    expect(result).toContain("100.00,50.00");
  });

  it("三点生成平滑曲线", () => {
    const result = generateSmoothPath([
      { x: 0, y: 0 },
      { x: 50, y: 30 },
      { x: 100, y: 10 },
    ]);

    // 应该以 M 开头
    expect(result).toMatch(/^M/);
    // 应该包含多个 C 命令
    const cCount = (result.match(/C/g) ?? []).length;
    expect(cCount).toBeGreaterThanOrEqual(2);
    // 终点应该是最后一个点
    expect(result).toContain("100.00,10.00");
  });

  it("多点生成连续曲线", () => {
    const result = generateSmoothPath([
      { x: 0, y: 0 },
      { x: 25, y: 30 },
      { x: 50, y: 10 },
      { x: 75, y: 40 },
      { x: 100, y: 20 },
    ]);

    // 应该以 M 开头
    expect(result).toMatch(/^M/);
    // 应该包含多个 C 命令（每个中间段一个，加上首尾）
    const cCount = (result.match(/C/g) ?? []).length;
    expect(cCount).toBeGreaterThanOrEqual(4);
    // 终点应该是最后一个点
    expect(result).toContain("100.00,20.00");
  });

  it("曲线穿过所有数据点", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 30 },
      { x: 100, y: 10 },
    ];

    const result = generateSmoothPath(points);

    // 路径格式：M... C... C...
    // 每个 C 命令的终点应该是对应的数据点
    // 格式：C cp1x,cp1y cp2x,cp2y ex,ey
    const cCount = (result.match(/C/g) ?? []).length;
    expect(cCount).toBe(2);

    // 提取所有 C 命令的终点坐标：按 C 分割，然后取每个段的最后两个数字
    const segments = result.split("C").slice(1); // 跳过 M 部分
    const endpoints = segments.map((seg) => {
      const nums = seg.match(/[\d.]+/g);
      if (nums && nums.length >= 2) {
        return nums[nums.length - 2] + "," + nums[nums.length - 1];
      }
      return null;
    });

    expect(endpoints.length).toBe(2);

    // 第一个 C 命令的终点应该是第二个点 (50, 30)
    expect(endpoints[0]).toBe("50.00,30.00");

    // 第二个 C 命令的终点应该是第三个点 (100, 10)
    expect(endpoints[1]).toBe("100.00,10.00");
  });

  it("起点和终点的切线平滑", () => {
    const points = [
      { x: 0, y: 50 },
      { x: 50, y: 10 },
      { x: 100, y: 50 },
    ];

    const result = generateSmoothPath(points);

    // 解析第一个 C 命令
    const firstC = result.match(/C([\d.]+),([\d.]+)/);
    if (firstC) {
      const cp1y = Number(firstC[2]);
      // 控制点的 y 坐标应该在起点和中间点之间（平滑过渡）
      expect(cp1y).toBeGreaterThan(10);
      expect(cp1y).toBeLessThanOrEqual(50);
    }

    // 解析最后一个 C 命令
    const segments = result.split(/(?<=\s)C/).filter(Boolean);
    const lastC = segments[segments.length - 1];
    const lastCMatch = lastC.match(/([\d.]+),([\d.]+)\s+([\d.]+),([\d.]+)/);
    if (lastCMatch) {
      const cp2y = Number(lastCMatch[2]);
      // 控制点的 y 坐标应该在中间点和终点之间（平滑过渡）
      expect(cp2y).toBeGreaterThanOrEqual(10);
      expect(cp2y).toBeLessThan(50);
    }
  });
});
