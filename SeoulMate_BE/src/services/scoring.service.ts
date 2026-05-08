import { SCORE_WEIGHT } from "../constants/scoreWeight";
import type {
  CandidatePlace,
  ParsedRecommendationRequest,
  RecommendationContextData,
  ScoredRecommendationPlace
} from "../graphs/recommendation.state";

interface ScorePlacesInput {
  request?: ParsedRecommendationRequest;
  places: CandidatePlace[];
  context?: RecommendationContextData;
}

const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));

const compactText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const buildSearchText = (place: CandidatePlace): string =>
  [
    place.title,
    place.category,
    place.region,
    place.address,
    place.sourceDataset,
    place.tags?.join(" "),
    compactText(place.metadata)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const includesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword.toLowerCase()));

const isOutdoorPlace = (place: CandidatePlace): boolean =>
  includesAny(buildSearchText(place), ["공원", "산책", "자연", "야외", "둘레길", "한강", "숲"]);

const isIndoorPlace = (place: CandidatePlace): boolean =>
  includesAny(buildSearchText(place), [
    "카페",
    "전시",
    "문화",
    "공간",
    "식당",
    "음식",
    "실내",
    "박물관"
  ]);

const estimatePlaceCost = (place: CandidatePlace): number => {
  if (typeof place.estimatedCost === "number") {
    return place.estimatedCost;
  }

  const text = buildSearchText(place);
  if (includesAny(text, ["무료", "free", "공원", "산책"])) {
    return 0;
  }

  if (includesAny(text, ["카페", "커피", "디저트"])) {
    return 9000;
  }

  if (includesAny(text, ["음식", "식당", "맛집", "restaurant"])) {
    return 15000;
  }

  if (includesAny(text, ["전시", "문화", "공연", "박물관"])) {
    return 12000;
  }

  return 8000;
};

const scoreRegion = (place: CandidatePlace, request?: ParsedRecommendationRequest): number => {
  if (!request?.region) {
    return SCORE_WEIGHT.region * 0.7;
  }

  const region = request.region.toLowerCase();
  const text = buildSearchText(place);

  if (text.includes(region)) {
    return SCORE_WEIGHT.region;
  }

  return SCORE_WEIGHT.region * 0.35;
};

const scoreBudget = (place: CandidatePlace, request?: ParsedRecommendationRequest): number => {
  if (!request?.budget) {
    return SCORE_WEIGHT.budget * 0.75;
  }

  const expectedPerPlaceBudget = request.budget / 3;
  const cost = estimatePlaceCost(place);

  if (cost <= expectedPerPlaceBudget) {
    return SCORE_WEIGHT.budget;
  }

  const overRatio = (cost - expectedPerPlaceBudget) / Math.max(expectedPerPlaceBudget, 1);
  return clamp(SCORE_WEIGHT.budget * (1 - overRatio), SCORE_WEIGHT.budget);
};

const scoreMood = (place: CandidatePlace, request?: ParsedRecommendationRequest): number => {
  const moods = request?.mood ?? [];
  if (!moods.length) {
    return SCORE_WEIGHT.mood * 0.65;
  }

  const text = buildSearchText(place);
  let score = 0;

  for (const mood of moods) {
    if (text.includes(mood.toLowerCase())) {
      score += SCORE_WEIGHT.mood / moods.length;
      continue;
    }

    if (mood.includes("조용") && (isIndoorPlace(place) || isOutdoorPlace(place))) {
      score += (SCORE_WEIGHT.mood / moods.length) * 0.85;
    } else if (mood.includes("부담") && estimatePlaceCost(place) <= 10000) {
      score += (SCORE_WEIGHT.mood / moods.length) * 0.9;
    } else if (
      mood.includes("감성") &&
      includesAny(text, ["카페", "전시", "문화", "공간", "야경"])
    ) {
      score += (SCORE_WEIGHT.mood / moods.length) * 0.85;
    } else if (mood.includes("활기") && includesAny(text, ["거리", "맛집", "시장", "관광"])) {
      score += (SCORE_WEIGHT.mood / moods.length) * 0.8;
    } else {
      score += (SCORE_WEIGHT.mood / moods.length) * 0.35;
    }
  }

  return clamp(score, SCORE_WEIGHT.mood);
};

const scoreCrowd = (context?: RecommendationContextData): number => {
  const predictedCongestion = context?.livingPopulation?.congestion;
  if (predictedCongestion === "low") {
    return SCORE_WEIGHT.crowd;
  }

  if (predictedCongestion === "medium") {
    return SCORE_WEIGHT.crowd * 0.8;
  }

  if (predictedCongestion === "high") {
    return SCORE_WEIGHT.crowd * 0.3;
  }

  const level = context?.cityData?.crowdLevel ?? "";

  if (level.includes("여유")) {
    return SCORE_WEIGHT.crowd;
  }

  if (level.includes("보통")) {
    return SCORE_WEIGHT.crowd * 0.8;
  }

  if (level.includes("약간")) {
    return SCORE_WEIGHT.crowd * 0.55;
  }

  if (level.includes("붐")) {
    return SCORE_WEIGHT.crowd * 0.3;
  }

  return SCORE_WEIGHT.crowd * 0.65;
};

const scoreWeather = (place: CandidatePlace, context?: RecommendationContextData): number => {
  const rainProbability = context?.weather?.rainProbability ?? 0;
  const skyStatus = context?.weather?.skyStatus ?? "";
  const rainy = rainProbability >= 60 || includesAny(skyStatus.toLowerCase(), ["비", "눈", "rain"]);

  if (!rainy) {
    return SCORE_WEIGHT.weather;
  }

  if (isIndoorPlace(place)) {
    return SCORE_WEIGHT.weather * 0.9;
  }

  if (isOutdoorPlace(place)) {
    return SCORE_WEIGHT.weather * 0.25;
  }

  return SCORE_WEIGHT.weather * 0.55;
};

const scoreDistance = (place: CandidatePlace, context?: RecommendationContextData): number => {
  const distance = context?.placeDistances?.[place.id]?.distanceMeter;

  if (distance === undefined) {
    return SCORE_WEIGHT.distance * 0.65;
  }

  if (distance <= 800) {
    return SCORE_WEIGHT.distance;
  }

  if (distance <= 1800) {
    return SCORE_WEIGHT.distance * 0.85;
  }

  if (distance <= 3500) {
    return SCORE_WEIGHT.distance * 0.55;
  }

  return SCORE_WEIGHT.distance * 0.25;
};

const scoreSafety = (place: CandidatePlace): number => {
  const text = buildSearchText(place);
  let score = SCORE_WEIGHT.safety * 0.65;

  if (place.mapVerification?.verified) {
    score += SCORE_WEIGHT.safety * 0.25;
  }

  if (place.sourceDataset || place.source) {
    score += SCORE_WEIGHT.safety * 0.2;
  }

  if (includesAny(text, ["위생", "인허가", "공원", "문화", "관광", "박물관"])) {
    score += SCORE_WEIGHT.safety * 0.15;
  }

  return clamp(score, SCORE_WEIGHT.safety);
};

const scorePurpose = (place: CandidatePlace, request?: ParsedRecommendationRequest): number => {
  if (!request?.purpose) {
    return SCORE_WEIGHT.purpose * 0.7;
  }

  const text = buildSearchText(place);
  if (
    request.purpose.includes("첫") &&
    includesAny(text, ["카페", "문화", "전시", "공원", "산책", "음식", "식당"])
  ) {
    return SCORE_WEIGHT.purpose;
  }

  return SCORE_WEIGHT.purpose * 0.65;
};

export const scoringService = {
  scorePlaces({ request, places, context }: ScorePlacesInput): ScoredRecommendationPlace[] {
    return places
      .map((place) => {
        const scoreDetail = {
          regionScore: scoreRegion(place, request),
          budgetScore: scoreBudget(place, request),
          moodScore: scoreMood(place, request),
          crowdScore: scoreCrowd(context),
          weatherScore: scoreWeather(place, context),
          distanceScore: scoreDistance(place, context),
          safetyScore: scoreSafety(place),
          purposeScore: scorePurpose(place, request)
        };

        const totalScore = Object.values(scoreDetail).reduce((sum, score) => sum + score, 0);

        return {
          placeId: place.id,
          totalScore: Number(totalScore.toFixed(2)),
          scoreDetail
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);
  }
};
