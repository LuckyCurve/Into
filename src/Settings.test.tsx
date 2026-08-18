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

vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: () => enable(),
  disable: () => disable(),
  isEnabled: () => isEnabled(),
}));

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
