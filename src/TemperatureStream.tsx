import { useState } from "react";
import type { DayBucket } from "./analytics";
import { formatMD } from "./format";
import { TEMPERATURE_WORDS } from "./types";

interface Props {
  buckets: DayBucket[];
}

const H = 120;
const W = 100;

// 温度等级配色，与「温度的切面」同源，让“点”和“条”说的是同一种温度。
const LEVEL_COLORS = ["#e7a78f", "#db8470", "#cf7e93", "#cf6a54", "#c25a78"];

function levelOf(avg: number): number {
  return Math.min(5, Math.max(1, Math.round(avg)));
}

function levelColor(avg: number): string {
  return LEVEL_COLORS[levelOf(avg) - 1];
}

export function TemperatureStream({ buckets }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (buckets.length === 0) return null;

  const n = buckets.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * W);
  const yFrac = (avg: number) => 1 - avg / 5; // 距顶比例：5 度贴顶，0 度贴底

  // 只在有数据的桶之间连线：把连续有数据的桶切成若干段，
  // 段与段之间的沉默日（count===0）断开，不把“没记录”画成最低温（0 度）。
  const runs: number[][] = [];
  let cur: number[] = [];
  buckets.forEach((b, i) => {
    if (b.count > 0) cur.push(i);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  });
  if (cur.length) runs.push(cur);

  const yAt = (i: number) => yFrac(buckets[i].avg) * H;

  const linePath = runs
    .map((run) =>
      run
        .map((i, k) => (k === 0 ? `M${x(i)},${yAt(i)}` : `L${x(i)},${yAt(i)}`))
        .join(" "),
    )
    .join(" ");

  const areaPath = runs
    .map((run) => {
      const top2 = run
        .map((i, k) => (k === 0 ? `M${x(i)},${yAt(i)}` : `L${x(i)},${yAt(i)}`))
        .join(" ");
      const first = run[0];
      const last = run[run.length - 1];
      return `${top2} L${x(last)},${H} L${x(first)},${H} Z`;
    })
    .join(" ");

  const total = buckets.reduce((s, b) => s + b.count, 0);
  const avgAll = total
    ? buckets.reduce((s, b) => s + b.avg * b.count, 0) / total
    : 0;

  const active = hover !== null ? buckets[hover] : null;
  const hx = hover !== null ? x(hover) : 0;
  const hy = active ? yFrac(active.avg) : 0;
  const below = active ? hy < 0.22 : false; // 贴近顶部的点，提示翻到下方
  const hAlign = hx >= 82 ? "end" : hx <= 18 ? "start" : "mid";

  return (
    <div className="stream-wrap">
      <div className="stream-plot" onMouseLeave={() => setHover(null)}>
        <div className="stream-canvas">
          <svg
            className="stream"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`温度随时间变化，整体平均 ${avgAll.toFixed(1)} 度，共 ${total} 条`}
          >
            <defs>
              <linearGradient id="streamFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--glow)" stopOpacity="0.95" />
                <stop offset="100%" stopColor="var(--glow)" stopOpacity="0.04" />
              </linearGradient>
            </defs>
            {/* 1~5 参考带：把曲线读成“温度刻度”，而不是一条无名起伏 */}
            {[1, 2, 3, 4, 5].map((lvl) => (
              <line
                key={lvl}
                x1="0"
                x2={W}
                y1={(1 - lvl / 5) * H}
                y2={(1 - lvl / 5) * H}
                stroke="var(--line)"
                strokeWidth="1"
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={areaPath} fill="url(#streamFill)" />
            <path
              d={linePath}
              fill="none"
              stroke="var(--coral-deep)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* 数据点的“温度点”：呼应录入时给念头打温度的那个签名元素 */}
          {buckets.map((b, i) =>
            b.count === 0 ? null : (
              <span
                key={i}
                className={"stream-dot" + (hover === i ? " on" : "")}
                style={{
                  left: `${x(i)}%`,
                  top: `${yFrac(b.avg) * 100}%`,
                  background: levelColor(b.avg),
                }}
                onMouseEnter={() => setHover(i)}
                aria-hidden="true"
              />
            ),
          )}

          {active && (
            <div
              className={
                "stream-tip" + (below ? " below" : "") + " " + hAlign
              }
              style={{ left: `${hx}%`, top: `${hy * 100}%` }}
            >
              <span className="tip-date">{formatMD(active.ts)}</span>
              <span className="tip-temp">
                <b>{active.avg.toFixed(1)}</b> 度 ·{" "}
                {TEMPERATURE_WORDS[levelOf(active.avg) - 1]}
              </span>
              <span className="tip-count">{active.count} 条</span>
            </div>
          )}
        </div>

        {/* 右侧刻度：1~5，让“温度”二字落到实处 */}
        <div className="stream-scale" aria-hidden="true">
          {[5, 4, 3, 2, 1].map((lvl) => (
            <span key={lvl} style={{ top: `${(1 - lvl / 5) * 100}%` }}>
              {lvl}
            </span>
          ))}
        </div>
      </div>

      <div className="stream-axis">
        <span>{formatMD(buckets[0].ts)}</span>
        <span className="stream-avg">
          平均 {avgAll.toFixed(1)} 度 · {total} 条
        </span>
        <span>{formatMD(buckets[buckets.length - 1].ts)}</span>
      </div>
    </div>
  );
}
