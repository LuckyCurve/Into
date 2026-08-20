import type { ScoreCount } from "./types";
import { TEMPERATURE_WORDS } from "./types";

interface Props {
  distribution: ScoreCount[];
}

export function ScoreSpread({ distribution }: Props) {
  const max = Math.max(1, ...distribution.map((d) => d.count));
  const total = distribution.reduce((s, d) => s + d.count, 0);
  const peak = [...distribution].sort((a, b) => b.count - a.count)[0];

  return (
    <div className="spread">
      <p className="spread-read">
        你最常给 <b>{peak.score} 度</b> ·{" "}
        {TEMPERATURE_WORDS[peak.score - 1]}，{total} 条记录里大多带着这个温度。
      </p>

      <div className="spread-bars">
        {distribution.map((d) => (
          <div className="spread-row" key={d.score}>
            <span className="spread-label">
              {d.score}
              <i> {TEMPERATURE_WORDS[d.score - 1]}</i>
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
    </div>
  );
}
