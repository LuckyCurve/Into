import type { Entry, ScoreCount } from "./types";
import { TEMPERATURE_WORDS } from "./types";

interface Props {
  distribution: ScoreCount[];
  entries: Entry[];
}

export function ScoreSpread({ distribution, entries }: Props) {
  const max = Math.max(1, ...distribution.map((d) => d.count));
  const total = distribution.reduce((s, d) => s + d.count, 0);
  const peak = [...distribution].sort((a, b) => b.count - a.count)[0];
  const top = [...entries].filter((e) => e.score >= 4).slice(0, 3);
  const faint = [...entries].filter((e) => e.score === 1).slice(0, 3);

  return (
    <div className="spread">
      <p className="spread-read">
        你最常给 <b>{peak.score} 度</b> ·{" "}
        {TEMPERATURE_WORDS[peak.score]}，{total} 条记录里大多带着这个温度。
      </p>

      <div className="spread-bars">
        {distribution.map((d) => (
          <div className="spread-row" key={d.score}>
            <span className="spread-label">
              {d.score}
              <i> {TEMPERATURE_WORDS[d.score]}</i>
            </span>
            <span className="spread-track">
              <span
                className="spread-fill"
                data-score={d.score}
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </span>
            <span className="spread-num">{d.count}</span>
          </div>
        ))}
      </div>

      {(top.length > 0 || faint.length > 0) && (
        <div className="spread-picks">
          {top.length > 0 && (
            <div className="pick">
              <span className="pick-tag warm">心里发暖</span>
              {top.map((e) => (
                <q key={e.id} className="pick-q">
                  {e.content}
                </q>
              ))}
            </div>
          )}
          {faint.length > 0 && (
            <div className="pick">
              <span className="pick-tag faint">淡淡的</span>
              {faint.map((e) => (
                <q key={e.id} className="pick-q">
                  {e.content}
                </q>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
