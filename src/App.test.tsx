import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import App from "./App";
import type { UpdateInfo } from "./types";

// 让 check_update 的返回可被每个用例动态改写；reject 用于模拟断网。
const state = vi.hoisted(() => ({
  update: {
    has_update: false,
    current: "0.6.1",
    latest: "0.6.1",
    url: "",
  } as UpdateInfo,
  reject: false,
}));

const invoke = vi.hoisted(() =>
  vi.fn((cmd: string, args?: unknown) => {
    if (cmd === "check_update") {
      if (state.reject) return Promise.reject(new Error("network down"));
      return Promise.resolve(state.update);
    }
    if (cmd === "open_release_page") {
      return Promise.resolve();
    }
    if (cmd === "list_blocked_terms") {
      return Promise.resolve([]);
    }
    return Promise.resolve(undefined);
  }),
);

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const getVersion = vi.hoisted(() => vi.fn(() => Promise.resolve("0.6.1")));
vi.mock("@tauri-apps/api/app", () => ({ getVersion }));

const getCurrentWindow = vi.hoisted(() =>
  vi.fn(() => ({
    startDragging: () => Promise.resolve(),
    startResizeDragging: () => Promise.resolve(),
    minimize: () => Promise.resolve(),
    hide: () => Promise.resolve(),
    setFocus: () => Promise.resolve(),
    show: () => Promise.resolve(),
  })),
);
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.reject = false;
  state.update = { has_update: false, current: "0.6.1", latest: "0.6.1", url: "" };
});

describe("顶栏 · 更新检查", () => {
  it("无更新时不显示 New 标记", async () => {
    state.update = {
      has_update: false,
      current: "0.6.1",
      latest: "0.6.1",
      url: "",
    };
    render(<App />);
    // 自动检查解析后仍不应出现标记
    await waitFor(() => expect(screen.queryByText("New")).toBeNull());
  });

  it("有更新时显示 New 标记，点击打开 Release 页", async () => {
    const url = "https://github.com/LuckyCurve/Into/releases/tag/0.4.0";
    state.update = {
      has_update: true,
      current: "0.6.1",
      latest: "0.4.0",
      url,
    };
    render(<App />);

    const badge = await screen.findByText("New");
    expect(badge).toBeTruthy();
    // 标记持续到真更新为止——点击后不消失
    fireEvent.click(badge);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_release_page", { url }),
    );
    expect(screen.queryByText("New")).not.toBeNull();
  });

  it("手动检查：无更新提示已是最新", async () => {
    state.update = {
      has_update: false,
      current: "0.6.1",
      latest: "0.6.1",
      url: "",
    };
    render(<App />);
    fireEvent.click(await screen.findByLabelText("设置"));
    fireEvent.click(await screen.findByRole("button", { name: "检查更新" }));
    expect(await screen.findByText("已经是最新版本")).toBeTruthy();
  });

  it("手动检查：失败时给出可读的错误提示（不暴露原始错误串）", async () => {
    state.reject = true;
    render(<App />);
    fireEvent.click(await screen.findByLabelText("设置"));
    fireEvent.click(await screen.findByRole("button", { name: "检查更新" }));
    // mock 的错误是 "network down"，应被转译成面向用户的网络提示
    const err = await screen.findByText(/网络好像不太顺畅/);
    expect(err).toBeTruthy();
  });
});

describe("全局 · into:toast 事件桥", () => {
  function emit(kind: "ok" | "info" | "error", msg: string) {
    window.dispatchEvent(new CustomEvent("into:toast", { detail: { kind, msg } }));
  }

  it("深层组件派发 into:toast 能弹出对应文案与状态的 toast", async () => {
    render(<App />);
    await act(async () => {}); // 让启动期 effect 先跑完
    act(() => emit("error", "没能屏蔽「咖啡」，请稍后再试"));
    const toast = screen.getByRole("status");
    expect(toast.textContent).toContain("没能屏蔽「咖啡」");
    expect(toast.className).toBe("toast toast-error");
  });

  it("detail 缺失或残缺时静默忽略，不弹空白 toast", async () => {
    render(<App />);
    await act(async () => {});
    act(() => {
      window.dispatchEvent(new Event("into:toast")); // 没有 detail
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("点击 toast 立即消失", async () => {
    render(<App />);
    await act(async () => {});
    act(() => emit("ok", "已是最新版本"));
    fireEvent.click(screen.getByRole("status"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("toast 在 4 秒后自动消失", async () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      await act(async () => {});
      act(() => emit("ok", "已屏蔽「咖啡」，可在设置里解除"));
      expect(screen.getByRole("status")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
