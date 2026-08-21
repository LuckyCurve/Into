import { describe, expect, it } from "vitest";
import { errorText, friendlyError } from "./errors";

describe("errorText", () => {
  it("字符串错误原样返回", () => {
    expect(errorText("boom")).toBe("boom");
  });

  it("Error 对象取 message", () => {
    expect(errorText(new Error("exploded"))).toBe("exploded");
  });

  it("其他类型走 String()", () => {
    expect(errorText(42)).toBe("42");
    expect(errorText(null)).toBe("null");
    expect(errorText(undefined)).toBe("undefined");
    expect(errorText({ code: 1 })).toBe("[object Object]");
  });
});

describe("friendlyError", () => {
  it("网络类错误给出网络提示，且大小写不敏感", () => {
    expect(friendlyError("Network unreachable")).toContain("网络");
    expect(friendlyError("request TIMEOUT after 30s")).toContain("网络");
    expect(friendlyError(new Error("connection refused"))).toContain("网络");
    expect(friendlyError("getaddrinfo failed for api.example.com")).toContain(
      "网络",
    );
  });

  it("权限类错误指向权限问题", () => {
    expect(friendlyError("Permission denied")).toContain("权限");
    expect(friendlyError("操作被拒绝")).toContain("权限");
  });

  it("数据库占用 / 锁定类错误提示稍后再试", () => {
    expect(friendlyError("database is locked")).toContain("占用");
    expect(friendlyError("resource busy")).toContain("占用");
  });

  it("内容不存在类错误说明可能已删除", () => {
    expect(friendlyError("no such table: entries")).toContain("不在了");
    expect(friendlyError("entry not found")).toContain("不在了");
  });

  it("未命中规则时返回调用方带场景的兜底文案", () => {
    expect(friendlyError("weird failure", "检查更新失败，请稍后再试")).toBe(
      "检查更新失败，请稍后再试",
    );
  });

  it("未命中且未传兜底时使用默认文案", () => {
    expect(friendlyError("???")).toBe("出了点问题，请再试一次");
  });

  it("规则按声明顺序生效，首个命中即返回", () => {
    // 同时含「network」和「locked」，应命中更靠前的网络规则
    expect(friendlyError("network error: database locked")).toContain("网络");
  });

  it("能处理非字符串、非 Error 的抛出值", () => {
    expect(friendlyError(123, "保存失败")).toBe("保存失败");
  });
});
