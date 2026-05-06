export interface ScoreBreakdown {
  congestion: number;
  travel: number;
  safety: number;
  cost: number;
  preference: number;
}

export interface ScoredPlace {
  publicDataId: number;
  totalScore: number;
  breakdown: ScoreBreakdown;
  reason: string;
}
