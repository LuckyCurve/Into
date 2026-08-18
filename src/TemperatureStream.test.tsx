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

  it("沉默日（count=0）断开连线，不把没记录画成最低温", () => {
    // 两端有数据、中间一天没记录
    const buckets = [b(5, 1, 1), b(0, 0, 2), b(3, 1, 3)];
    const { container } = render(<TemperatureStream buckets={buckets} />);
    const line = container.querySelector("path[stroke]") as SVGPathElement;
    const d = line.getAttribute("d")!;
    // 两段数据 → 两个 M（move）命令，段间不连
    expect((d.match(/M/g) ?? []).length).toBe(2);
    // 不应出现连到 y=120（底部 0 度）的线段
    expect(d).not.toContain(",120 L");
  });

  it("连续有数据的多天正常连成一条线", () => {
    const buckets = [b(4, 1, 1), b(2, 1, 2), b(5, 1, 3)];
    const { container } = render(<TemperatureStream buckets={buckets} />);
    const line = container.querySelector("path[stroke]") as SVGPathElement;
    const d = line.getAttribute("d")!;
    // 一段连续数据 → 单个 M 起头，后接 L
    expect((d.match(/M/g) ?? []).length).toBe(1);
    expect(d).toContain("L");
  });
});
