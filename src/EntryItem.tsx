import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Entry } from "./types";
import { Temperature } from "./Temperature";

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  entry: Entry;
  onChanged: () => void;
}

export function EntryItem({ entry, onChanged }: Props) {
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
    await invoke("update_entry", { id: entry.id, content: content.trim(), score });
    setEditing(false);
    setError(null);
    onChanged();
  }

  async function remove() {
    await invoke("delete_entry", { id: entry.id });
    onChanged();
  }

  if (editing) {
    return (
      <li className="entry-item editing">
        <textarea
          className="entry edit-box"
          value={content}
          rows={3}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="temperature">
          <span className="temperature-label">温度</span>
          <Temperature value={score} onChange={setScore} />
        </div>
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
      <p className="entry-content">{entry.content}</p>
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
