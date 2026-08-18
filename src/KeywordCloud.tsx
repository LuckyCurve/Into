import type { Keyword } from "./types";

interface Props {
  keywords: Keyword[];
  active: string | null;
  onToggle: (term: string) => void;
  onBlock?: (term: string) => void;
}

export function KeywordCloud({ keywords, active, onToggle, onBlock }: Props) {
  if (keywords.length === 0) {
    return (
      <p className="cloud-empty">记录再多一点，反复出现的词会在这里显形。</p>
    );
  }
  const max = keywords[0].count;
  const min = keywords[keywords.length - 1].count;

  return (
    <div className="cloud" role="group" aria-label="常提到的词，点击筛选记录，✕ 不再显示">
      {keywords.map((k) => {
        const t = (k.count - min) / Math.max(1, max - min);
        const size = 14 + t * 12; // 14..26px
        const on = active === k.term;
        return (
          <span className="cloud-item" key={k.term}>
            <button
              type="button"
              className={"cloud-word" + (on ? " on" : "")}
              style={{ fontSize: `${size}px` }}
              aria-pressed={on}
              onClick={() => onToggle(k.term)}
            >
              {k.term}
            </button>
            {onBlock && (
              <button
                type="button"
                className="cloud-block"
                aria-label={`不再显示「${k.term}」`}
                title="不再显示这个词"
                onClick={() => onBlock(k.term)}
              >
                ✕
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
