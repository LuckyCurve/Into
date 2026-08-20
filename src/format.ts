// 本地时间格式化工具，集中维护避免各组件各自拼字符串。
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 形如「1月5日 09:07」的条目时间戳（本地时区）。 */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 形如「3月15日」的短日期，用于温度曲线的坐标轴。 */
export function formatMD(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
