import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TemperatureStream } from "./TemperatureStream";
import type { DayBucket } from "./analytics";

function b(avg: number, count: number, ts = 0): DayBucket {
  return { ts, avg, count };
}

describe("TemperatureStream", () => {
  it("空数据不渲染", () => {
    const { container } = render(<TemperatureStream buckets={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("沉默日（count=0）不绘制数据点，但曲线连续穿过", () => {
    // 两端有数据、中间一天没记录
    const buckets = [b(5, 1, 1), b(0, 0, 2), b(3, 1, 3)];
    const { container } = render(<TemperatureStream buckets={buckets} />);
    const line = container.querySelector("path[stroke]") as SVGPathElement;
    const d = line.getAttribute("d")!;
    // 现在是连续曲线，只有一个 M 命令
    expect((d.match(/M/g) ?? []).length).toBe(1);
    // 曲线应该包含 C 命令（贝塞尔曲线）
    expect(d).toContain("C");
    // 不应出现连到 y=120（底部 0 度）的线段
    expect(d).not.toContain(",120 C");
    // 没有数据的点不应有对应的圆点
    const dots = container.querySelectorAll(".stream-dot");
    expect(dots.length).toBe(2); // 只有两个有数据的点
  });

  it("连续有数据的多天正常连成一条平滑曲线", () => {
    const buckets = [b(4, 1, 1), b(2, 1, 2), b(5, 1, 3)];
    const { container } = render(<TemperatureStream buckets={buckets} />);
    const line = container.querySelector("path[stroke]") as SVGPathElement;
    const d = line.getAttribute("d")!;
    // 一段连续数据 → 单个 M 起头
    expect((d.match(/M/g) ?? []).length).toBe(1);
    // 使用平滑的贝塞尔曲线（C 命令），不是直线（L 命令）
    expect(d).toContain("C");
    expect(d).not.toContain(" L");
  });
});
