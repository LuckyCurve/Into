import { useState } from "react";
import type { DayBucket } from "./analytics";
import { generateSmoothPath } from "./curve";
import { formatMD } from "./format";
import { TEMPERATURE_WORDS } from "./types";

interface Props {
  buckets: DayBucket[];
}

const H = 120;
const W = 100;

// 温度等级配色：引用全局 CSS 变量（--temp-1~5），与「温度的切面」严格同源，
// 让“点”和“条”说的是同一种温度。
const LEVEL_COLORS = [
  "var(--temp-1)",
  "var(--temp-2)",
  "var(--temp-3)",
  "var(--temp-4)",
  "var(--temp-5)",
];

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

  // 提取有数据的点，用于绘制平滑曲线
  const dataPoints = buckets
    .map((b, i) => ({ index: i, x: x(i), y: yFrac(b.avg) * H, count: b.count }))
    .filter((p) => p.count > 0);

  // 生成平滑曲线路径
  const points = dataPoints.map((p) => ({ x: p.x, y: p.y }));
  const linePath = generateSmoothPath(points);

  // 面积填充：从曲线底部到基准线
  let areaPath = linePath;
  if (dataPoints.length > 0) {
    const first = dataPoints[0];
    const last = dataPoints[dataPoints.length - 1];
    areaPath += ` L${last.x.toFixed(2)},${H} L${first.x.toFixed(2)},${H} Z`;
  }

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
                <stop offset="0%" stopColor="var(--coral)" stopOpacity="0.4" />
                <stop offset="50%" stopColor="var(--glow)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--paper-soft)" stopOpacity="0.05" />
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
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
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
