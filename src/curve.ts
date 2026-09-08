/**
 * 平滑曲线生成工具
 * 使用 Catmull-Rom 样条生成穿过数据点的平滑曲线
 */

interface Point {
  x: number;
  y: number;
}

/**
 * Catmull-Rom 转 Cubic Bezier：把 4 个控制点转成 SVG 的 C 命令
 * 让曲线平滑地穿过每个数据点
 *
 * @param p0 前一个点
 * @param p1 当前点（曲线将穿过此点）
 * @param p2 下一个点（曲线将穿过此点）
 * @param p3 下下个点
 * @param tension 张力系数，控制曲线的紧密程度（0~1，默认 0.5）
 * @returns SVG 的 C 命令字符串
 */
export function catmullRomToBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tension: number = 0.5,
): string {
  const t = tension / 3;
  const cp1x = p1.x + (p2.x - p0.x) * t;
  const cp1y = p1.y + (p2.y - p0.y) * t;
  const cp2x = p2.x - (p3.x - p1.x) * t;
  const cp2y = p2.y - (p3.y - p1.y) * t;

  return `C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
}

/**
 * 生成平滑曲线路径：使用 Catmull-Rom 样条，穿过所有数据点
 *
 * @param points 数据点数组
 * @returns SVG 路径字符串（M/C 命令）
 */
export function generateSmoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  }

  // 起点
  let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;

  if (points.length === 2) {
    // 两个点：用平滑的贝塞尔曲线连接，而不是直线
    const p0 = points[0];
    const p1 = points[1];
    const midX = (p0.x + p1.x) / 2;
    // 控制点：水平方向在中点，垂直方向保持原高度
    d += ` C${midX.toFixed(2)},${p0.y.toFixed(2)} ${midX.toFixed(2)},${p1.y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
    return d;
  }

  // 三个及以上点：使用 Catmull-Rom 样条
  // 第一段：从 points[0] 到 points[1]
  {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    // 虚拟前一个点：假设曲线从左侧水平进入
    const virtualP0 = { x: 2 * p0.x - p1.x, y: p0.y };
    d += " " + catmullRomToBezier(virtualP0, p0, p1, p2);
  }

  // 中间段：从 points[1] 到 points[n-2]
  for (let i = 1; i < points.length - 2; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2];
    d += " " + catmullRomToBezier(p0, p1, p2, p3);
  }

  // 最后一段：从 points[n-2] 到 points[n-1]
  {
    const n = points.length;
    const p0 = points[n - 3];
    const p1 = points[n - 2];
    const p2 = points[n - 1];
    // 虚拟后一个点：假设曲线从右侧水平离开
    const virtualP3 = { x: 2 * p2.x - p1.x, y: p2.y };
    d += " " + catmullRomToBezier(p0, p1, p2, virtualP3);
  }

  return d;
}
