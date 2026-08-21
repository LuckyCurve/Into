/**
 * 把底层错误（Rust invoke 返回的字符串、Error 对象等）转成面向用户的一句话：
 * 说清发生了什么，并给出下一步。原始错误串是给开发者看的，不该直接进界面。
 *
 * 规则按顺序匹配，命中即返回；都不命中时返回调用方给的兜底文案
 * （调用方的兜底可以带上场景，比如「检查更新失败」）。
 */
const RULES: Array<{ re: RegExp; text: string }> = [
  {
    re: /network|net::|timed?[\s_-]?out|timeout|connect|dns|resolve|getaddrinfo/i,
    text: "网络好像不太顺畅，稍后再试一次",
  },
  {
    re: /permission|denied|unauthorized|forbidden|拒绝|权限/i,
    text: "系统没有放行这个操作，检查权限后再试",
  },
  {
    re: /locked|busy|in\s*use|锁|占用/i,
    text: "数据正被占用，稍等一下再试",
  },
  {
    re: /not\s*found|no\s*such|missing|不存在|找不到/i,
    text: "要找的内容不在了，可能已被删除",
  },
];

/** 从任意抛出的值里取出可读的错误文本。 */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function friendlyError(
  e: unknown,
  fallback = "出了点问题，请再试一次",
): string {
  const raw = errorText(e);
  for (const rule of RULES) {
    if (rule.re.test(raw)) return rule.text;
  }
  return fallback;
}
