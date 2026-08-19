import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { Settings, decideAutostartAction } from "./Settings";
import type { DbStats } from "./types";

const { enable, disable, isEnabled } = vi.hoisted(() => ({
  enable: vi.fn(() => Promise.resolve()),
  disable: vi.fn(() => Promise.resolve()),
  isEnabled: vi.fn(() => Promise.resolve(false)),
}));

const dbStats = vi.hoisted(() => ({
  // 默认：空库（total=0），生成按钮可用、清理按钮禁用。
  value: { total: 0, sample: 0, real: 0, can_clear_sample: false },
}));

const invoke = vi.hoisted(() =>
  vi.fn((cmd: string) => {
    if (cmd === "list_blocked_terms") return Promise.resolve(["咖啡", "电影"]);
    if (cmd === "db_stats") return Promise.resolve(dbStats.value);
    return Promise.resolve(undefined);
  }),
);

vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: () => enable(),
  disable: () => disable(),
  isEnabled: () => isEnabled(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  dbStats.value = { total: 0, sample: 0, real: 0, can_clear_sample: false };
});

describe("decideAutostartAction", () => {
  it("已开启 -> 下一次应关闭", () => {
    expect(decideAutostartAction(true)).toEqual({
      action: "disable",
      next: false,
    });
  });

  it("已关闭 -> 下一次应开启", () => {
    expect(decideAutostartAction(false)).toEqual({
      action: "enable",
      next: true,
    });
  });
});

describe("设置页 · 开机自启开关", () => {
  it("isEnabled 为 false 时显示关闭，点击调用 enable", async () => {
    isEnabled.mockReturnValue(Promise.resolve(false));
    render(<Settings open={true} onClose={() => {}} />);
    const sw = await screen.findByRole("switch");
    await waitFor(() =>
      expect(sw.getAttribute("aria-checked")).toBe("false"),
    );
    fireEvent.click(sw);
    await waitFor(() => expect(enable).toHaveBeenCalledTimes(1));
  });

  it("isEnabled 为 true 时显示开启，点击调用 disable", async () => {
    isEnabled.mockReturnValue(Promise.resolve(true));
    render(<Settings open={true} onClose={() => {}} />);
    const sw = await screen.findByRole("switch");
    await waitFor(() =>
      expect(sw.getAttribute("aria-checked")).toBe("true"),
    );
    fireEvent.click(sw);
    await waitFor(() => expect(disable).toHaveBeenCalledTimes(1));
  });

  it("未打开（open=false）时不渲染任何内容", () => {
    const { container } = render(<Settings open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("设置页 · 屏蔽的词", () => {
  it("打开时列出已屏蔽的词，点击 ✕ 调用 unblock_keyword 并从列表移除", async () => {
    render(<Settings open={true} onClose={() => {}} />);
    expect(await screen.findByText("咖啡")).toBeTruthy();
    expect(screen.getByText("电影")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("解除屏蔽「咖啡」"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("unblock_keyword", { term: "咖啡" }),
    );
    await waitFor(() => expect(screen.queryByText("咖啡")).toBeNull());
  });

  it("输入词后点击屏蔽，调用 block_keyword", async () => {
    render(<Settings open={true} onClose={() => {}} />);
    const input = await screen.findByLabelText("要屏蔽的词");
    fireEvent.change(input, { target: { value: "测试词" } });
    fireEvent.click(screen.getByText("屏蔽"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("block_keyword", { term: "测试词" }),
    );
  });
});

describe("设置页 · 示例数据生成与清理", () => {
  it("db_stats 未就绪（stats 为 null）时，生成与清理均安全禁用", async () => {
    // 模拟命令缺失 / 尚未返回：默认走安全态，不能误让生成按钮可点。
    dbStats.value = undefined as unknown as DbStats;
    render(<Settings open={true} onClose={() => {}} />);
    const gen = await screen.findByRole("button", { name: "生成示例数据" });
    expect(gen.disabled).toBe(true);
    const clear = screen.getByRole("button", { name: "清理示例数据" });
    expect(clear.disabled).toBe(true);
  });

  it("空库时「生成示例数据」可点击，『清理示例数据』不可用", async () => {
    dbStats.value = { total: 0, sample: 0, real: 0, can_clear_sample: false };
    render(<Settings open={true} onClose={() => {}} />);
    const gen = await screen.findByRole("button", { name: "生成示例数据" });
    expect(gen.disabled).toBe(false);
    const clear = screen.getByRole("button", { name: "清理示例数据" });
    expect(clear.disabled).toBe(true);
  });

  it("数据库已有记录时，「生成示例数据」被禁用", async () => {
    dbStats.value = { total: 3, sample: 3, real: 0, can_clear_sample: true };
    render(<Settings open={true} onClose={() => {}} />);
    const gen = await screen.findByRole("button", { name: "生成示例数据" });
    expect(gen.disabled).toBe(true);
  });

  it("全部是示例数据时，「清理示例数据」可用", async () => {
    dbStats.value = { total: 5, sample: 5, real: 0, can_clear_sample: true };
    render(<Settings open={true} onClose={() => {}} />);
    const clear = await screen.findByRole("button", { name: "清理示例数据" });
    expect(clear.disabled).toBe(false);
  });

  it("混入真实记录时，「清理示例数据」被禁用", async () => {
    dbStats.value = { total: 6, sample: 5, real: 1, can_clear_sample: false };
    render(<Settings open={true} onClose={() => {}} />);
    const clear = await screen.findByRole("button", { name: "清理示例数据" });
    expect(clear.disabled).toBe(true);
  });

  it("点击「清理示例数据」确认后调用 clear_sample_data", async () => {
    dbStats.value = { total: 5, sample: 5, real: 0, can_clear_sample: true };
    render(<Settings open={true} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "清理示例数据" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认清理？" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("clear_sample_data"),
    );
  });

  it("点击「生成示例数据」确认后调用 generate_test_data", async () => {
    dbStats.value = { total: 0, sample: 0, real: 0, can_clear_sample: false };
    render(<Settings open={true} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "生成示例数据" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认生成？" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("generate_test_data"),
    );
  });
});
