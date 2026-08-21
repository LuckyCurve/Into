import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Entry } from "./types";
import { EntryEditor } from "./EntryEditor";
import { Temperature } from "./Temperature";
import { formatDate } from "./format";
import { friendlyError } from "./errors";

function renderContent(text: string, hl?: string): ReactNode {
  if (!hl) return text;
  const lower = text.toLowerCase();
  const q = hl.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (true) {
    const j = lower.indexOf(q, i);
    if (j < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(
      <mark key={k++} className="hl">
        {text.slice(j, j + q.length)}
      </mark>,
    );
    i = j + q.length;
  }
  return parts;
}

interface Props {
  entry: Entry;
  highlight?: string;
  onChanged: () => void;
}

export function EntryItem({ entry, highlight, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(entry.content);
  const [score, setScore] = useState<number | null>(entry.score);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!content.trim()) {
      setError("写点什么再保存");
      return;
    }
    if (score === null) {
      setError("给一个温度");
      return;
    }
    try {
      await invoke("update_entry", { id: entry.id, content: content.trim(), score });
      setEditing(false);
      setError(null);
      onChanged();
    } catch (e) {
      setError(friendlyError(e, "没保存上，请再试一次"));
    }
  }

  async function remove() {
    try {
      await invoke("delete_entry", { id: entry.id });
      onChanged();
    } catch (e) {
      setError(friendlyError(e, "没删掉，请再试一次"));
    }
  }

  if (editing) {
    return (
      <li className="entry-item editing">
        <EntryEditor
          content={content}
          score={score}
          onContentChange={setContent}
          onScoreChange={setScore}
        />
        {error && <p className="item-error">{error}</p>}
        <div className="item-actions">
          <button type="button" className="ghost" onClick={save}>
            保存
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setEditing(false);
              setContent(entry.content);
              setScore(entry.score);
              setError(null);
            }}
          >
            取消
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="entry-item">
      <p className="entry-content">{renderContent(entry.content, highlight)}</p>
      {error && <p className="item-error">{error}</p>}
      <div className="entry-meta">
        <Temperature value={entry.score} readOnly />
        <span className="entry-date">{formatDate(entry.created_at)}</span>
        <span className="item-actions">
          <button type="button" className="ghost" onClick={() => setEditing(true)}>
            编辑
          </button>
          <button type="button" className="ghost danger" onClick={remove}>
            删除
          </button>
        </span>
      </div>
    </li>
  );
}
