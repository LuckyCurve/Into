import type { DayBucket } from "./analytics";

interface Props {
  buckets: DayBucket[];
}

const H = 120;
const W = 100;

function fmtMD(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function TemperatureStream({ buckets }: Props) {
  if (buckets.length === 0) return null;
  const n = buckets.length;
  const x = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * W);
  const y = (avg: number) => H - (avg / 5) * H; // 0 度在底，5 度在顶

  const pts = buckets.map((b, i) => [x(i), y(b.avg)] as const);
  const line = pts
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  const total = buckets.reduce((s, b) => s + b.count, 0);
  const avgAll = total
    ? buckets.reduce((s, b) => s + b.avg * b.count, 0) / total
    : 0;

  return (
    <div className="stream-wrap">
      <svg
        className="stream"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`温度随时间变化，整体平均 ${avgAll.toFixed(1)} 度`}
      >
        <defs>
          <linearGradient id="streamFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--glow)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--glow)" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#streamFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--coral-deep)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="stream-axis">
        <span>{fmtMD(buckets[0].ts)}</span>
        <span className="stream-avg">平均 {avgAll.toFixed(1)} 度</span>
        <span>{fmtMD(buckets[buckets.length - 1].ts)}</span>
      </div>
    </div>
  );
}
