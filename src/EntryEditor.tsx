import { forwardRef, useRef } from "react";
import { Temperature } from "./Temperature";

interface Props {
  content: string;
  score: number | null;
  onContentChange: (v: string) => void;
  onScoreChange: (n: number) => void;
  /** textarea 的 class：录入页用 "entry"，编辑态用 "entry edit-box"。 */
  textareaClassName?: string;
  placeholder?: string;
  /** 录入页的 textarea 随输入增高；编辑态固定高度，不传即可。 */
  autoGrow?: boolean;
}

/**
 * 受控的「内容 + 温度」编辑块，录入页（Capture）与编辑态（EntryItem）共用同一份标记。
 * 校验 / 保存 / 取消 / 状态提示由各调用方自己处理——两者语义本就不同，不应塞进这里。
 */
export const EntryEditor = forwardRef<HTMLTextAreaElement, Props>(function EntryEditor(
  { content, score, onContentChange, onScoreChange, textareaClassName = "entry edit-box", placeholder, autoGrow },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const setRef = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  };

  const grow = (el: HTMLTextAreaElement) => {
    if (!autoGrow) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <>
      <textarea
        ref={setRef}
        className={textareaClassName}
        placeholder={placeholder}
        value={content}
        rows={3}
        onChange={(e) => {
          onContentChange(e.target.value);
          grow(e.target);
        }}
      />
      <div className="temperature">
        <span className="temperature-label">温度</span>
        <Temperature value={score} onChange={onScoreChange} />
      </div>
    </>
  );
});
