import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Temperature } from "./Temperature";

const PLACEHOLDER =
  "比如：今天路过一家藏在巷子里的小咖啡店，安静得让人想坐一会儿……\n或者一段长长的感受，都可以。";

export function Capture() {
  const [content, setContent] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function leave() {
    if (!content.trim()) {
      setStatus({ kind: "err", text: "先写点什么吧" });
      return;
    }
    if (score === null) {
      setStatus({ kind: "err", text: "给这一刻一个温度" });
      return;
    }
    try {
      await invoke("add_entry", { content: content.trim(), score });
      setContent("");
      setScore(null);
      setStatus({ kind: "ok", text: "已留下" });
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el) {
          el.style.height = "auto";
          el.focus();
        }
      });
    } catch (e) {
      setStatus({ kind: "err", text: String(e) });
    }
  }

  return (
    <section className="capture">
      <p className="eyebrow">Into · 最近</p>
      <h1 className="prompt">最近，有什么让你心里动了一下？</h1>
      <p className="hint">写下一行此刻的念头，或一段长长的感受。</p>
      <textarea
        ref={ref}
        className="entry"
        placeholder={PLACEHOLDER}
        value={content}
        rows={3}
        onChange={(e) => {
          setContent(e.target.value);
          autoGrow(e.target);
        }}
      />
      <div className="temperature">
        <span className="temperature-label">温度</span>
        <Temperature value={score} onChange={setScore} />
      </div>
      <div className="actions">
        <button
          type="button"
          className="leave"
          disabled={!content.trim() || score === null}
          onClick={leave}
        >
          留下来
        </button>
        {status && <span className={"status " + status.kind}>{status.text}</span>}
      </div>
    </section>
  );
}
