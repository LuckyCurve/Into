export interface Entry {
  id: number;
  content: string;
  score: number;
  created_at: number;
  updated_at: number | null;
  /** 1 = 示例数据（由「生成示例数据」插入）；0 = 用户的真实记录。 */
  is_sample: number;
}

/** 数据库记录构成统计，用于驱动「生成 / 清理示例数据」按钮的可用状态。 */
export interface DbStats {
  /** 总记录数。 */
  total: number;
  /** 示例记录数。 */
  sample: number;
  /** 真实记录数。 */
  real: number;
  /** 仅当「全部都是示例数据」时为真：有示例且混入零条真实记录。空库为 false。 */
  can_clear_sample: boolean;
}

export interface ScoreCount {
  score: number;
  count: number;
}

export interface RangeSummary {
  count: number;
  avg_score: number;
  distribution: ScoreCount[];
}

export interface ReviewResult {
  entries: Entry[];
  summary: RangeSummary;
  keywords: Keyword[];
}

export interface Keyword {
  term: string;
  count: number;
}

export const TEMPERATURE_WORDS = ["", "淡淡的", "有点在意", "挺喜欢", "很喜欢", "心里发暖"];

export interface UpdateInfo {
  has_update: boolean;
  current: string;
  latest: string;
  url: string;
}

