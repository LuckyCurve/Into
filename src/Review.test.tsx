import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { Review } from "./Review";
import type { ReviewResult } from "./types";

const state = vi.hoisted(() => ({
  blockShouldReject: false,
  blockedTerms: [] as string[],
}));

function makeResult(keywords: Array<{ term: string; count: number }>): ReviewResult {
  return {
    // 词云面板只在有记录时渲染，补一条最小记录撑起布局。
    entries: [
      {
        id: 1,
        content: "今天喝了咖啡",
        score: 3,
        created_at: Date.now(),
        updated_at: null,
        is_sample: 0,
      },
    ],
    summary: {
      count: 1,
      avg_score: 3,
      distribution: [1, 2, 3, 4, 5].map((score) => ({ score, count: score === 3 ? 1 : 0 })),
    },
    keywords,
  };
}

const invoke = vi.hoisted(() =>
  vi.fn((cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "review") return Promise.resolve(reviewValue);
    if (cmd === "block_keyword") {
      if (state.blockShouldReject) return Promise.reject("没有可屏蔽的词");
      state.blockedTerms.push(String(args?.term));
      return Promise.resolve(undefined);
    }
    return Promise.resolve(undefined);
  }),
);

// reviewValue 在 vi.hoisted 之后赋值（引用同一个对象）。
let reviewValue = makeResult([]);

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.blockShouldReject = false;
  state.blockedTerms = [];
});

describe("回看页 · 词云右键屏蔽链路", () => {
  it("右键菜单确认后调用 block_keyword，并重新拉取数据让词从云里消失", async () => {
    let keywords = [{ term: "咖啡", count: 3 }, { term: "雨天", count: 2 }];
    reviewValue = makeResult(keywords);
    render(<Review />);
    expect(await screen.findByText("咖啡")).toBeTruthy();

    fireEvent.contextMenu(screen.getByText("咖啡"));
    fireEvent.click(screen.getByRole("menuitem"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("block_keyword", { term: "咖啡" }),
    );
    // 屏蔽成功后立刻刷新：第二次 review 里不再有这个词。
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3)); // review ×2 + block ×1
    expect(state.blockedTerms).toEqual(["咖啡"]);
  });

  it("屏蔽当前正在筛选的词时，同时取消筛选", async () => {
    reviewValue = makeResult([{ term: "咖啡", count: 3 }]);
    render(<Review />);
    const word = await screen.findByText("咖啡");
    fireEvent.click(word); // 先点它开启筛选
    expect(await screen.findByText(/筛选：/)).toBeTruthy();

    // 开启筛选后「咖啡」在词云和筛选条各出现一次，取词云里的那个（渲染在前）。
    fireEvent.contextMenu(screen.getAllByText("咖啡")[0]);
    fireEvent.click(screen.getByRole("menuitem"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("block_keyword", { term: "咖啡" }),
    );
    await waitFor(() => expect(screen.queryByText(/筛选：/)).toBeNull());
  });

  it("屏蔽成功弹 ok toast，失败弹 error toast", async () => {
    reviewValue = makeResult([{ term: "咖啡", count: 3 }]);
    const toasts: Array<{ kind: string; msg: string }> = [];
    function spy(e: Event) {
      toasts.push((e as CustomEvent<{ kind: string; msg: string }>).detail);
    }
    window.addEventListener("into:toast", spy);

    render(<Review />);
    fireEvent.contextMenu(await screen.findByText("咖啡"));
    fireEvent.click(screen.getByRole("menuitem"));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].kind).toBe("ok");
    expect(toasts[0].msg).toContain("已屏蔽「咖啡」");

    cleanup();
    toasts.length = 0;
    state.blockShouldReject = true;
    reviewValue = makeResult([{ term: "雨天", count: 2 }]);
    render(<Review />);
    fireEvent.contextMenu(await screen.findByText("雨天"));
    fireEvent.click(screen.getByRole("menuitem"));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].kind).toBe("error");

    window.removeEventListener("into:toast", spy);
  });

  it("屏蔽失败时不重新拉取数据，错误提示带场景兑底", async () => {
    reviewValue = makeResult([{ term: "雨天", count: 2 }]);
    state.blockShouldReject = true;
    const toasts: Array<{ kind: string; msg: string }> = [];
    function spy(e: Event) {
      toasts.push((e as CustomEvent<{ kind: string; msg: string }>).detail);
    }
    window.addEventListener("into:toast", spy);

    render(<Review />);
    fireEvent.contextMenu(await screen.findByText("雨天"));
    fireEvent.click(screen.getByRole("menuitem"));
    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0].kind).toBe("error");
    // 底层错误串不直接进界面，展示的是带场景的兑底文案
    expect(toasts[0].msg).toContain("没能屏蔽「雨天」");

    // 失败不触发刷新：review 只在挂载时拉过一次，当前视图不被打断
    const reviewCalls = invoke.mock.calls.filter((c) => c[0] === "review").length;
    expect(reviewCalls).toBe(1);
    window.removeEventListener("into:toast", spy);
  });

  it("屏蔽的不是当前筛选词时，筛选保持不变", async () => {
    reviewValue = makeResult([
      { term: "咖啡", count: 3 },
      { term: "雨天", count: 2 },
    ]);
    render(<Review />);
    fireEvent.click(await screen.findByText("咖啡")); // 开启「咖啡」筛选
    expect(await screen.findByText(/筛选：/)).toBeTruthy();

    fireEvent.contextMenu(screen.getByText("雨天")); // 屏蔽的是另一个词
    fireEvent.click(screen.getByRole("menuitem"));
    await waitFor(() => expect(state.blockedTerms).toEqual(["雨天"]));
    // 屏蔽成功并刷新后，「咖啡」筛选仍在
    await waitFor(() =>
      expect(invoke.mock.calls.filter((c) => c[0] === "review").length).toBe(2),
    );
    expect(screen.getByText(/筛选：/)).toBeTruthy();
  });
});
