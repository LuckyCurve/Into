import { describe, it, expect } from "vitest";
import { formatDate, formatMD } from "./format";

describe("formatDate", () => {
  it("本地时间格式为「月日 时:分」，且分钟补零", () => {
    // 2024-01-05 09:07（本地时区）
    const ms = new Date(2024, 0, 5, 9, 7).getTime();
    expect(formatDate(ms)).toBe("1月5日 09:07");
  });

  it("个位数小时/分钟也都补零", () => {
    const ms = new Date(2024, 10, 3, 0, 5).getTime();
    expect(formatDate(ms)).toBe("11月3日 00:05");
  });
});

describe("formatMD", () => {
  it("只输出「月日」", () => {
    const ms = new Date(2024, 2, 15).getTime();
    expect(formatMD(ms)).toBe("3月15日");
  });
});
