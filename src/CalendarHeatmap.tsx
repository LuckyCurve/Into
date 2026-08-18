import type { HeatCell } from "./analytics";

interface Props {
  cells: HeatCell[];
}

function fmtMD(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function colorFor(count: number, max: number): string {
  if (count <= 0) return "var(--line)";
  const r = count / max;
  if (r <= 0.25) return "#f3ddd4";
  if (r <= 0.5) return "#e9b6a3";
  if (r <= 0.75) return "#db8b76";
  return "#cf6a54";
}

export function CalendarHeatmap({ cells }: Props) {
  if (cells.length === 0) return null;
  const max = Math.max(1, ...cells.map((c) => c.count));
  const weeks = Math.max(...cells.map((c) => c.weekIndex)) + 1;

  return (
    <div
      className="heat-scroll"
      role="img"
      aria-label={`记录密度日历，最多的一天写了 ${max} 条`}
    >
      <div
        className="heat-grid"
        style={{ gridTemplateColumns: `repeat(${weeks}, 14px)` }}
      >
        {cells.map((c) => (
          <span
            key={c.ts}
            className="heat-cell"
            title={`${fmtMD(c.ts)} · ${c.count} 条`}
            style={{ background: colorFor(c.count, max) }}
          />
        ))}
      </div>
    </div>
  );
}
