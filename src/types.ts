export interface Entry {
  id: number;
  content: string;
  score: number;
  created_at: number;
  updated_at: number | null;
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
