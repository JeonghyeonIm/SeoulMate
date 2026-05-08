export const SCORE_WEIGHT = {
  region: 20,
  budget: 15,
  mood: 18,
  crowd: 12,
  weather: 10,
  distance: 10,
  safety: 8,
  purpose: 7
} as const;

export const MAX_RECOMMENDATION_SCORE = Object.values(SCORE_WEIGHT).reduce(
  (sum, value) => sum + value,
  0
);
