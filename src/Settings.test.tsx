import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { Settings, decideAutostartAction } from "./Settings";

const { enable, disable, isEnabled } = vi.hoisted(() => ({
  enable: vi.fn(() => Promise.resolve()),
  disable: vi.fn(() => Promise.resolve()),
  isEnabled: vi.fn(() => Promise.resolve(false)),
}));

const invoke = vi.hoisted(() =>
  vi.fn((cmd: string) => {
    if (cmd === "list_blocked_terms") return Promise.resolve(["咖啡", "电影"]);
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
