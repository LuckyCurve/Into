import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { KeywordCloud, clampMenu, MENU_W, MENU_H } from "./KeywordCloud";
import type { Keyword } from "./types";

const keywords: Keyword[] = [
  { term: "咖啡", count: 5 },
  { term: "雨天", count: 3 },
  { term: "散步", count: 2 },
];

afterEach(cleanup);

describe("clampMenu", () => {
  const W = 1024;
  const H = 768;

  it("窗口内的位置原样保留", () => {
    expect(clampMenu(400, 300, W, H)).toEqual({ x: 400, y: 300 });
  });

  it("靠近右下边时夹回可见范围（留 8px 边距）", () => {
    const r = clampMenu(W - 10, H - 10, W, H);
    expect(r.x).toBeLessThanOrEqual(W - 8);
    expect(r.y).toBeLessThanOrEqual(H - 8);
  });

  it("负坐标贴到 0，不会弹出屏幕外", () => {
    expect(clampMenu(-30, -5, W, H)).toEqual({ x: 0, y: 0 });
  });

  it("窗口比菜单还小时退到 (0, 0)，不产生负数定位", () => {
    expect(clampMenu(50, 50, 100, 40)).toEqual({ x: 0, y: 0 });
  });
});

describe("KeywordCloud · 展示与筛选", () => {
  it("渲染全部词，点击调用 onToggle", () => {
    const onToggle = vi.fn();
    render(
      <KeywordCloud keywords={keywords} active={null} onToggle={onToggle} onBlock={() => {}} />,
    );
    fireEvent.click(screen.getByText("咖啡"));
    expect(onToggle).toHaveBeenCalledWith("咖啡");
  });

  it("激活的词带 on 状态（aria-pressed）", () => {
    render(
      <KeywordCloud keywords={keywords} active="雨天" onToggle={() => {}} onBlock={() => {}} />,
    );
    expect(screen.getByText("雨天").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("咖啡").getAttribute("aria-pressed")).toBe("false");
  });

  it("没有关键词时给出空态文案", () => {
    render(<KeywordCloud keywords={[]} active={null} onToggle={() => {}} onBlock={() => {}} />);
    expect(screen.getByText(/记录再多一点/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("KeywordCloud · 右键屏蔽", () => {
  function renderCloud(onBlock = vi.fn()) {
    const onBlockFn = onBlock;
    render(
      <KeywordCloud keywords={keywords} active={null} onToggle={() => {}} onBlock={onBlockFn} />,
    );
    return onBlockFn;
  }

  it("右键一个词弹出自定义菜单（不触发浏览器默认菜单），并显示动作与后果说明", () => {
    renderCloud();
    fireEvent.contextMenu(screen.getByText("雨天"));
    const menu = screen.getByRole("menu");
    expect(menu).toBeTruthy();
    expect(screen.getByRole("menuitem").textContent).toContain("屏蔽「雨天」");
    expect(screen.getByText("不再出现在常提到的词里")).toBeTruthy();
  });

  it("菜单出现在鼠标附近且不超出窗口（jsdom 视口 1024×768）", () => {
    renderCloud();
    fireEvent.contextMenu(screen.getByText("咖啡"), { clientX: 500, clientY: 300 });
    const menu = screen.getByRole("menu") as HTMLElement;
    expect(menu.style.left).toBe("500px");
    expect(menu.style.top).toBe("300px");
  });

  it("点击「屏蔽」调用 onBlock 并收起菜单", () => {
    const onBlock = renderCloud();
    fireEvent.contextMenu(screen.getByText("散步"), { clientX: 200, clientY: 200 });
    fireEvent.click(screen.getByRole("menuitem"));
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(onBlock).toHaveBeenCalledWith("散步");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Esc 收起菜单但不屏蔽", () => {
    const onBlock = renderCloud();
    fireEvent.contextMenu(screen.getByText("咖啡"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onBlock).not.toHaveBeenCalled();
  });

  it("点菜单外收起菜单但不屏蔽", () => {
    const onBlock = renderCloud();
    fireEvent.contextMenu(screen.getByText("咖啡"));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onBlock).not.toHaveBeenCalled();
  });

  it("在菜单内按下鼠标不会提前拆菜单，click 正常生效", () => {
    const onBlock = renderCloud();
    fireEvent.contextMenu(screen.getByText("咖啡"));
    const item = screen.getByRole("menuitem");
    // 真实点击顺序：mousedown 先于 click；菜单必须活到 click。
    fireEvent.mouseDown(item);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(item);
    expect(onBlock).toHaveBeenCalledWith("咖啡");
  });

  it("菜单打开时焦点落在动作项上（键盘可达）", () => {
    renderCloud();
    fireEvent.contextMenu(screen.getByText("咖啡"));
    expect(document.activeElement).toBe(screen.getByRole("menuitem"));
  });

  it("右键位置贴近窗口右下角时，菜单被夹回可见范围（jsdom 视口 1024×768）", () => {
    renderCloud();
    fireEvent.contextMenu(screen.getByText("咖啡"), {
      clientX: 2000,
      clientY: 1500,
    });
    const menu = screen.getByRole("menu") as HTMLElement;
    expect(menu.style.left).toBe(`${1024 - MENU_W - 8}px`);
    expect(menu.style.top).toBe(`${768 - MENU_H - 8}px`);
  });

  it("菜单开着时右键另一个词：切换到新词的菜单，不残留旧词", () => {
    renderCloud();
    fireEvent.contextMenu(screen.getByText("咖啡"));
    expect(screen.getByRole("menu").getAttribute("aria-label")).toBe(
      "屏蔽「咖啡」",
    );
    fireEvent.contextMenu(screen.getByText("散步"));
    expect(screen.getByRole("menu").getAttribute("aria-label")).toBe(
      "屏蔽「散步」",
    );
    expect(screen.queryByText(/屏蔽「咖啡」/)).toBeNull();
  });

  it("仅右键打开菜单不会误触发 onBlock", () => {
    const onBlock = renderCloud();
    fireEvent.contextMenu(screen.getByText("雨天"));
    expect(onBlock).not.toHaveBeenCalled();
  });
});
