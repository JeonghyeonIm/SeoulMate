import { mapClient } from "../clients/map.client";
import { openaiClient } from "../clients/openai.client";
import {
  runRecommendationGraph,
  runRecommendationGraphWithoutAiExplanation
} from "../graphs/recommendation.graph";
import type {
  AiExplanation,
  CandidatePlace,
  CongestionLevel,
  ParsedRecommendationRequest,
  RecommendationContextData,
  RecommendationCourse,
  RecommendationCoursePlace,
  RecommendationValidation,
  ScoredRecommendationPlace,
  SeoulMateGraphState
} from "../graphs/recommendation.state";
import type { PublicDataset } from "../models/publicDataset.model";
import type {
  RecommendationItem,
  RecommendationRequest,
  SavedCourse
} from "../models/recommendation.model";
import { publicDataRepository } from "../repositories/publicData.repository";
import { recommendationRepository } from "../repositories/recommendation.repository";
import { ApiError } from "../utils/ApiError";

export interface RecommendationResult {
  requestId?: number;
  request: {
    rawInput: string;
    parsed: unknown;
  };
  course?: RecommendationCourse;
  explanation?: AiExplanation;
  context?: RecommendationContextData;
  scores?: ScoredRecommendationPlace[];
  validation?: RecommendationValidation;
  riskNotices: string[];
  warnings: string[];
  finalRecommendation?: unknown;
  candidateCount: number;
  errors: string[];
}

export interface RecommendCoursePayload {
  input?: string;
  query?: string;
  vibes?: string[];
  region?: string;
  budget?: number;
  duration?: string;
  dateTime?: string;
  purpose?: string;
}

export interface CoursePlaceResponse {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  order: number;
  stayDuration?: number;
  priceMin?: number;
  priceMax?: number;
  reason?: string;
}

export interface WeatherResponse {
  source: "citydata" | "ultra-short-term" | "short-term" | "medium-term" | "unavailable";
  skyStatus: string | null;
  temperature: number | null;
  rainProbability: number | null;
  weatherAlert: string | null;
}

export type RecommendationType = "best" | "balanced" | "indoor" | "low-budget" | "short-walk";

export interface CourseResponse {
  id: string;
  title: string;
  description?: string;
  recommendationRank?: number;
  recommendationType?: RecommendationType;
  isRecommended?: boolean;
  totalCost: number;
  duration: number;
  congestion: CongestionLevel;
  weather: WeatherResponse;
  places: CoursePlaceResponse[];
}

export interface PagedCoursesResponse {
  data: CourseResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface RecommendCoursesResponse {
  courses: CourseResponse[];
  recommendedCourseId?: string;
  warnings?: string[];
}

type InternalWeather = NonNullable<RecommendationContextData["weather"]>;

type RecommendationVariant = {
  type: RecommendationType;
};

type CourseRole = "cafe" | "culture" | "walk" | "food" | "attraction";

type BuiltCourseVariant = {
  type: RecommendationType;
  course: RecommendationCourse;
  explanation?: AiExplanation;
  requestId?: number;
};

type BatchAiExplanationResponse = {
  courses: Array<{
    type: RecommendationType;
    summary: string;
    reason: string;
    riskNotice: string;
    alternativeSuggestion: string;
  }>;
};

export interface CourseDetail {
  request: RecommendationRequest;
  items: Array<
    RecommendationItem & {
      place: PublicDataset | null;
    }
  >;
  saved?: SavedCourse | null;
}

const serializePreferredCategory = (categories?: string[]): string | null =>
  categories?.length ? categories.join(",") : null;

const ALLOWED_MOODS = [
  "조용한",
  "힙한",
  "낭만적인",
  "로맨틱",
  "활기찬",
  "고즈넉한",
  "현대적인",
  "감성적인",
  "자연친화적"
];

const normalizeMood = (value: string): string | undefined => {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  if (ALLOWED_MOODS.includes(normalized)) {
    return normalized;
  }

  if (normalized.includes("로맨틱") || normalized.includes("로맨스")) return "로맨틱";
  if (normalized.includes("낭만")) return "낭만적인";
  if (normalized.includes("자연") || normalized.includes("숲") || normalized.includes("야외")) {
    return "자연친화적";
  }

  return ALLOWED_MOODS.find((mood) => normalized.includes(mood.replace(/적인$|한$|적$/g, "")));
};

const normalizeMoods = (values: string[]): string[] => [
  ...new Set(values.map(normalizeMood).filter((mood): mood is string => Boolean(mood)))
];

const MAX_BUDGET = 200000;
const OPEN_ENDED_BUDGET = 200001;
const BUDGET_STEP = 5000;

const readRecommendationBudget = (value: unknown): number => {
  const budget = Number(value);
  if (!Number.isInteger(budget)) {
    throw new ApiError(400, "budget 값은 정수여야 합니다.");
  }

  if (budget === OPEN_ENDED_BUDGET) {
    return budget;
  }

  if (budget < 0 || budget > MAX_BUDGET || budget % BUDGET_STEP !== 0) {
    throw new ApiError(400, "budget 값은 0부터 200000까지 5000원 단위이거나 200001이어야 합니다.");
  }

  return budget;
};

const budgetToText = (budget: number): string =>
  budget === OPEN_ENDED_BUDGET ? `${MAX_BUDGET}원 초과` : `${budget}원 이하`;

const durationToHours = (duration?: string): number | undefined => {
  if (!duration) {
    return undefined;
  }

  const normalized = duration.trim().toLowerCase();
  const durationBuckets: Record<string, number> = {
    "lte-2h": 2,
    "gt-2h-lte-4h": 4,
    "gt-4h-lte-6h": 6,
    "gt-6h-lte-8h": 8,
    "gt-8h-lte-10h": 10,
    "gt-10h-lte-12h": 12,
    "gt-12h": 13
  };

  if (durationBuckets[normalized]) {
    return durationBuckets[normalized];
  }

  const hourMatch = normalized.match(/^(\d+(?:\.\d+)?)h$/);
  if (hourMatch) {
    return Number(hourMatch[1]);
  }

  if (normalized === "half-day") {
    return 4;
  }

  if (normalized === "full-day") {
    return 8;
  }

  return undefined;
};

const durationHoursToText = (hours?: number): string | undefined =>
  hours ? (hours > 12 ? "12시간 초과" : `${hours}시간`) : undefined;

const hasDateTimeHint = (value: string): boolean =>
  /(오늘|지금|내일|모레|이번\s*주|다음\s*주|\d+\s*(시간|일)\s*(뒤|후)|일요일|월요일|화요일|수요일|목요일|금요일|토요일|\d{1,2}\s*시|오전|오후|저녁|밤|점심)/.test(
    value
  );

const DATE_TIME_RANGE_ERROR_MESSAGE = "날짜는 현재 시각 이후 10일 이내만 입력 가능합니다.";
const MAX_DATE_TIME_RANGE_MS = 10 * 24 * 60 * 60 * 1000;

const validateRequestDateTime = (value: string): string => {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) {
    throw new ApiError(400, "유효한 dateTime 형식이 아닙니다.");
  }

  const now = Date.now();
  const targetTime = target.getTime();
  if (targetTime < now || targetTime > now + MAX_DATE_TIME_RANGE_MS) {
    throw new ApiError(400, DATE_TIME_RANGE_ERROR_MESSAGE);
  }

  return target.toISOString();
};

const readRequestDateTime = (value: unknown): string => {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    throw new ApiError(400, "유효한 dateTime 형식이 아닙니다.");
  }

  const trimmed = value.trim();
  return trimmed ? validateRequestDateTime(trimmed) : "";
};

const normalizeStringArray = (value: unknown, fieldName: string, required = false): string[] => {
  if (value === undefined) {
    if (required) {
      throw new ApiError(400, `${fieldName} 값은 필수입니다.`);
    }
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError(400, `${fieldName} 값은 문자열 배열이어야 합니다.`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
};

const buildStructuredRecommendationInput = (
  payload: RecommendCoursePayload
): { rawInput: string; parsedRequest?: ParsedRecommendationRequest } => {
  const legacyInput = typeof payload.input === "string" ? payload.input.trim() : "";

  if (legacyInput && !payload.region && !payload.budget && !payload.duration && !payload.vibes) {
    const dateTime = readRequestDateTime(payload.dateTime);
    return {
      rawInput: legacyInput,
      parsedRequest: dateTime ? { dateTime } : undefined
    };
  }

  const region = typeof payload.region === "string" ? payload.region.trim() : "";
  const budget = readRecommendationBudget(payload.budget);
  const durationHours = durationToHours(payload.duration);
  const vibes = normalizeMoods(normalizeStringArray(payload.vibes, "vibes", true));
  const dateTime = readRequestDateTime(payload.dateTime);
  const purpose = typeof payload.purpose === "string" ? payload.purpose.trim() : undefined;
  const query = typeof payload.query === "string" ? payload.query.trim() : legacyInput;

  if (!region) {
    throw new ApiError(400, "region 값은 필수입니다.");
  }

  if (!durationHours) {
    throw new ApiError(
      400,
      "duration 값은 lte-2h, gt-2h-lte-4h, gt-4h-lte-6h, gt-6h-lte-8h, gt-8h-lte-10h, gt-10h-lte-12h, gt-12h 중 하나여야 합니다."
    );
  }

  const structuredText = [
    query,
    `${region}에서`,
    budgetToText(budget),
    durationHoursToText(durationHours),
    vibes.length ? `${vibes.join(", ")} 분위기` : undefined,
    purpose
  ]
    .filter(Boolean)
    .join(" / ");

  const parsedRequest: ParsedRecommendationRequest = {
    region,
    budget,
    durationHours,
    mood: vibes
  };

  if (dateTime) {
    parsedRequest.dateTime = dateTime;
  }

  if (purpose) {
    parsedRequest.purpose = purpose;
  }

  if (!dateTime && !hasDateTimeHint(query)) {
    parsedRequest.dateTime = new Date().toISOString();
  }

  return {
    rawInput: structuredText,
    parsedRequest
  };
};

const getScore = (scores: ScoredRecommendationPlace[] | undefined, placeId: number): number =>
  scores?.find((score) => score.placeId === placeId)?.totalScore ?? 0;

const getCandidate = (
  candidates: CandidatePlace[] | undefined,
  placeId: number
): CandidatePlace | undefined => candidates?.find((candidate) => candidate.id === placeId);

const assertOwnRequest = (
  request: RecommendationRequest | null,
  userId: number
): RecommendationRequest => {
  if (!request || request.userId !== userId) {
    throw new ApiError(404, "코스를 찾을 수 없습니다.");
  }

  return request;
};

const buildCourseDetail = async (
  request: RecommendationRequest,
  saved?: SavedCourse | null
): Promise<CourseDetail> => {
  const items = await recommendationRepository.listItemsByRequest(request.id);
  const hydratedItems = await Promise.all(
    items.map(async (item) => ({
      ...item,
      place: await publicDataRepository.getById(item.publicDataId)
    }))
  );

  return {
    request,
    items: hydratedItems,
    saved
  };
};

const crowdToCongestion = (crowdLevel?: string): CongestionLevel => {
  if (!crowdLevel) {
    return "unknown";
  }

  if (crowdLevel.includes("여유")) {
    return "low";
  }

  if (crowdLevel.includes("보통")) {
    return "medium";
  }

  if (crowdLevel.includes("붐") || crowdLevel.includes("혼잡")) {
    return "high";
  }

  return "unknown";
};

const resolveCourseCongestion = (context?: RecommendationContextData): CongestionLevel =>
  context?.livingPopulation?.congestion ?? crowdToCongestion(context?.cityData?.crowdLevel);

const courseDuration = (places: RecommendationCoursePlace[]): number =>
  places.reduce((sum, place) => sum + place.estimatedTimeMinute + (place.moveTimeMinute ?? 0), 0);

const normalizeWeatherSource = (
  source?: InternalWeather["source"] | string | null
): WeatherResponse["source"] => {
  if (source === "cityData" || source === "citydata") {
    return "citydata";
  }

  if (source === "ultraShortTerm" || source === "ultra-short-term") {
    return "ultra-short-term";
  }

  if (source === "shortTerm" || source === "short-term") {
    return "short-term";
  }

  if (source === "mediumTerm" || source === "medium-term") {
    return "medium-term";
  }

  return "unavailable";
};

const nullableNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toWeatherResponse = (weather?: RecommendationContextData["weather"]): WeatherResponse => ({
  source: normalizeWeatherSource(weather?.source),
  skyStatus: weather?.skyStatus ?? null,
  temperature: nullableNumber(weather?.temperature),
  rainProbability: nullableNumber(weather?.rainProbability),
  weatherAlert: weather?.weatherAlert ?? null
});

const weatherSnapshotByRequestId = new Map<number, WeatherResponse>();

const recommendationVariants: RecommendationVariant[] = [
  { type: "best" },
  { type: "balanced" },
  { type: "indoor" },
  { type: "low-budget" },
  { type: "short-walk" }
];

const uniqueStringArray = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

const congestionPenalty: Record<CongestionLevel, number> = {
  low: 0,
  medium: 4,
  high: 12,
  unknown: 3
};

const scoreApiCourse = (
  course: CourseResponse,
  budget?: number,
  targetDurationHours?: number
): number => {
  const budgetPenalty =
    typeof budget === "number" ? Math.max(0, course.totalCost - budget) / 1000 : 0;
  const targetDurationMinute = (targetDurationHours ?? 4) * 60;
  const durationPenalty =
    course.duration > targetDurationMinute ? (course.duration - targetDurationMinute) / 8 : 0;
  const diversityBonus = Math.min(course.places.length, 4) * 3;

  return (
    100 + diversityBonus - budgetPenalty - durationPenalty - congestionPenalty[course.congestion]
  );
};

const placeSearchText = (place: CandidatePlace): string =>
  [
    place.title,
    place.category,
    place.region,
    place.address,
    place.sourceDataset,
    place.tags?.join(" "),
    JSON.stringify(place.metadata ?? {})
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const textIncludesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword.toLowerCase()));

const normalizeVariantPlaceTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^가-힣a-z0-9]/g, "");

const inferVariantRole = (place: CandidatePlace): CourseRole => {
  const text = placeSearchText(place);

  if (textIncludesAny(text, ["restaurant", "음식", "식당", "맛집", "한식", "양식", "일식"])) {
    return "food";
  }

  if (textIncludesAny(text, ["cafe", "카페", "커피", "베이커리", "디저트"])) {
    return "cafe";
  }

  if (textIncludesAny(text, ["park", "nature", "공원", "산책", "자연", "숲", "하천"])) {
    return "walk";
  }

  if (
    textIncludesAny(text, ["culture", "attraction", "전시", "문화", "공연", "박물관", "미술관"])
  ) {
    return "culture";
  }

  return "attraction";
};

const roleMatchesVariant = (role: CourseRole, place: CandidatePlace): boolean =>
  inferVariantRole(place) === role ||
  (role === "attraction" && inferVariantRole(place) === "culture");

const variantRoleLabel = (role: CourseRole, fallback: string): string =>
  ({
    cafe: "카페",
    culture: "문화공간",
    walk: "산책",
    food: "음식점",
    attraction: fallback
  })[role];

const resolvePlaceCountRange = (durationHours: number): { min: number; max: number } => {
  if (durationHours <= 2) return { min: 1, max: 2 };
  if (durationHours <= 4) return { min: 2, max: 3 };
  if (durationHours <= 6) return { min: 3, max: 4 };
  if (durationHours <= 8) return { min: 4, max: 5 };
  if (durationHours <= 10) return { min: 5, max: 6 };
  if (durationHours <= 12) return { min: 6, max: 7 };
  return { min: 7, max: 8 };
};

const variantRoleDuration = (role: CourseRole, durationHours: number): number => {
  const compactDurations: Record<CourseRole, number> = {
    cafe: 45,
    culture: 55,
    walk: 40,
    food: 55,
    attraction: 45
  };
  const defaultDurations: Record<CourseRole, number> = {
    cafe: 60,
    culture: 80,
    walk: 50,
    food: 70,
    attraction: 60
  };

  return (durationHours <= 2 ? compactDurations : defaultDurations)[role];
};

const estimateVariantCost = (place: CandidatePlace): number => {
  if (typeof place.estimatedCost === "number") {
    return place.estimatedCost;
  }

  const role = inferVariantRole(place);
  if (role === "walk") return 0;
  if (role === "cafe") return 9000;
  if (role === "food") return 15000;
  if (role === "culture") return 12000;
  return 8000;
};

const hasCoordinate = (place: CandidatePlace): boolean =>
  typeof place.latitude === "number" && typeof place.longitude === "number";

const estimateVariantMoveTimeMinute = (
  previousPlace: CandidatePlace | undefined,
  nextPlace: CandidatePlace
): number => {
  if (!previousPlace || !hasCoordinate(previousPlace) || !hasCoordinate(nextPlace)) {
    return 0;
  }

  const distanceMeter = mapClient.calculateDistanceMeter(
    {
      latitude: previousPlace.latitude as number,
      longitude: previousPlace.longitude as number
    },
    {
      latitude: nextPlace.latitude as number,
      longitude: nextPlace.longitude as number
    }
  );

  return mapClient.estimateWalkingDurationMinute(distanceMeter);
};

const estimateProjectedVariantDuration = (
  selected: Array<{ role: CourseRole; place: CandidatePlace }>,
  next: { role: CourseRole; place: CandidatePlace },
  durationHours: number
): number =>
  selected.reduce(
    (sum, item, index) =>
      sum +
      variantRoleDuration(item.role, durationHours) +
      estimateVariantMoveTimeMinute(selected[index - 1]?.place, item.place),
    0
  ) +
  variantRoleDuration(next.role, durationHours) +
  estimateVariantMoveTimeMinute(selected[selected.length - 1]?.place, next.place);

const sortCandidatesForVariant = (
  candidates: CandidatePlace[],
  scores: ScoredRecommendationPlace[] | undefined,
  variant: RecommendationType
): CandidatePlace[] => {
  const scoreById = new Map(scores?.map((score) => [score.placeId, score.totalScore]) ?? []);

  return [...candidates].sort((left, right) => {
    if (variant === "low-budget") {
      const costDiff = estimateVariantCost(left) - estimateVariantCost(right);
      if (costDiff !== 0) {
        return costDiff;
      }
    }

    return (scoreById.get(right.id) ?? 0) - (scoreById.get(left.id) ?? 0);
  });
};

const selectVariantPlace = (
  role: CourseRole,
  pool: CandidatePlace[],
  usedIds: Set<number>,
  usedTitles: Set<string>,
  remainingBudget?: number,
  previousPlace?: CandidatePlace,
  preferNearest = false
): CandidatePlace | undefined => {
  const available = pool.filter(
    (place) =>
      !usedIds.has(place.id) &&
      !usedTitles.has(normalizeVariantPlaceTitle(place.title)) &&
      (remainingBudget === undefined || estimateVariantCost(place) <= remainingBudget)
  );
  const matched = available.filter((place) => roleMatchesVariant(role, place));
  const rawPool = matched.length ? matched : available;
  const sortedPool =
    preferNearest && previousPlace && hasCoordinate(previousPlace)
      ? [...rawPool].sort((left, right) => {
          const leftDistance = hasCoordinate(left)
            ? mapClient.calculateDistanceMeter(
                {
                  latitude: previousPlace.latitude as number,
                  longitude: previousPlace.longitude as number
                },
                { latitude: left.latitude as number, longitude: left.longitude as number }
              )
            : Number.POSITIVE_INFINITY;
          const rightDistance = hasCoordinate(right)
            ? mapClient.calculateDistanceMeter(
                {
                  latitude: previousPlace.latitude as number,
                  longitude: previousPlace.longitude as number
                },
                { latitude: right.latitude as number, longitude: right.longitude as number }
              )
            : Number.POSITIVE_INFINITY;

          return leftDistance - rightDistance;
        })
      : rawPool;

  return sortedPool.find(hasCoordinate) ?? sortedPool[0];
};

const routeCoursePlaces = async (
  coursePlaces: RecommendationCoursePlace[]
): Promise<RecommendationCoursePlace[]> => {
  const routePoints = coursePlaces
    .filter((place) => typeof place.latitude === "number" && typeof place.longitude === "number")
    .map((place) => ({
      latitude: place.latitude as number,
      longitude: place.longitude as number
    }));

  if (routePoints.length !== coursePlaces.length || routePoints.length < 2) {
    return coursePlaces;
  }

  const routeSummary = mapClient.estimateWalkingRoute(routePoints);
  return coursePlaces.map((place, index) => {
    const leg = routeSummary.legs[index - 1];
    if (!leg) {
      return place;
    }

    return {
      ...place,
      moveTimeMinute: leg.durationMinute,
      moveDistanceMeter: leg.distanceMeter,
      routeProvider: leg.provider,
      routeFallback: leg.isFallback
    };
  });
};

const variantRoles: Record<RecommendationType, CourseRole[]> = {
  best: ["cafe", "culture", "walk", "food", "attraction", "cafe", "culture", "food"],
  balanced: ["cafe", "culture", "walk", "food", "attraction", "cafe", "culture", "food"],
  indoor: ["cafe", "culture", "food", "cafe", "culture", "food", "attraction", "cafe"],
  "low-budget": ["walk", "cafe", "culture", "walk", "attraction", "cafe", "culture", "food"],
  "short-walk": ["cafe", "culture", "food", "cafe", "culture", "attraction", "food", "cafe"]
};

const buildVariantTitle = (state: SeoulMateGraphState, type: RecommendationType): string => {
  const region = state.parsedRequest?.region ?? "서울";
  const purpose = state.parsedRequest?.purpose ?? "데이트";
  const label: Record<RecommendationType, string> = {
    best: "추천",
    balanced: "균형형",
    indoor: "실내 중심",
    "low-budget": "가성비",
    "short-walk": "이동 적은"
  };

  return `${region} ${label[type]} ${purpose} 코스`;
};

const buildCourseVariant = async (
  state: SeoulMateGraphState,
  type: RecommendationType
): Promise<RecommendationCourse | null> => {
  if (type === "best" && state.course?.places.length) {
    return state.course;
  }

  const candidates = state.candidatePlaces ?? [];
  if (!candidates.length) {
    return null;
  }

  const durationHours = state.parsedRequest?.durationHours ?? 3;
  const placeCountRange = resolvePlaceCountRange(durationHours);
  const roles = variantRoles[type].slice(0, placeCountRange.max);
  const sortedCandidates = sortCandidatesForVariant(candidates, state.scoredPlaces, type);
  const usedIds = new Set<number>();
  const usedTitles = new Set<string>();
  const selected: Array<{ role: CourseRole; place: CandidatePlace }> = [];
  const maxDurationMinute = durationHours > 12 ? Number.POSITIVE_INFINITY : durationHours * 60;
  let remainingBudget =
    type === "low-budget" && typeof state.parsedRequest?.budget === "number"
      ? Math.round(state.parsedRequest.budget * 0.85)
      : state.parsedRequest?.budget;

  for (const role of roles) {
    const place = selectVariantPlace(
      role,
      sortedCandidates,
      usedIds,
      usedTitles,
      remainingBudget,
      selected[selected.length - 1]?.place,
      type === "short-walk" || type === "balanced"
    );

    if (!place) {
      continue;
    }

    const projectedDuration = estimateProjectedVariantDuration(
      selected,
      { role, place },
      durationHours
    );
    if (selected.length >= placeCountRange.min && projectedDuration > maxDurationMinute) {
      break;
    }

    selected.push({ role, place });
    usedIds.add(place.id);
    usedTitles.add(normalizeVariantPlaceTitle(place.title));

    if (remainingBudget !== undefined) {
      remainingBudget -= estimateVariantCost(place);
    }
  }

  if (!selected.length) {
    const fallback = sortedCandidates.find(hasCoordinate) ?? sortedCandidates[0];
    selected.push({ role: inferVariantRole(fallback), place: fallback });
  }

  const coursePlaces = await routeCoursePlaces(
    selected.map(({ role, place }, index) => ({
      order: index + 1,
      placeId: place.id,
      title: place.title,
      category: roleMatchesVariant(role, place)
        ? variantRoleLabel(role, place.category)
        : place.category,
      estimatedTimeMinute: variantRoleDuration(role, durationHours),
      estimatedCost: estimateVariantCost(place),
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude
    }))
  );

  return {
    title: buildVariantTitle(state, type),
    places: coursePlaces,
    totalScore:
      coursePlaces.reduce((sum, place) => sum + getScore(state.scoredPlaces, place.placeId), 0) /
      Math.max(coursePlaces.length, 1),
    estimatedBudget: coursePlaces.reduce((sum, place) => sum + (place.estimatedCost ?? 0), 0)
  };
};

const fallbackVariantExplanation = (
  state: SeoulMateGraphState,
  variant: BuiltCourseVariant
): AiExplanation => {
  const placeNames = variant.course.places.map((place) => place.title).join(" -> ");
  const budget = state.parsedRequest?.budget;
  const costText =
    budget !== undefined
      ? `예상 비용은 ${variant.course.estimatedBudget.toLocaleString("ko-KR")}원으로 요청 예산 ${budgetToText(budget)} 기준에서 확인했습니다.`
      : `예상 비용은 ${variant.course.estimatedBudget.toLocaleString("ko-KR")}원입니다.`;

  return {
    summary: `${buildVariantTitle(state, variant.type)}: ${placeNames} 순서로 이동 부담을 고려해 구성했습니다.`,
    reason: `${costText} 같은 후보 데이터와 실시간 컨텍스트 안에서 ${variant.type} 성격에 맞게 장소 유형과 동선을 다르게 조합했습니다.`,
    riskNotice: state.riskNotices?.join(" / ") ?? "",
    alternativeSuggestion:
      state.contextData?.weather?.rainProbability && state.contextData.weather.rainProbability >= 60
        ? "비 예보가 있어 실내 비중이 높은 코스도 함께 확인하는 것을 권장합니다."
        : "혼잡도가 높아지면 가까운 실내 장소 중심으로 순서를 조정할 수 있습니다."
  };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);

const attachBatchExplanations = async (
  state: SeoulMateGraphState,
  variants: BuiltCourseVariant[]
): Promise<BuiltCourseVariant[]> => {
  if (!variants.length) {
    return variants;
  }

  try {
    const response = await withTimeout(
      openaiClient.createJsonResponse<BatchAiExplanationResponse>({
        schemaName: "seoulmate_course_variant_explanations",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            courses: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  type: {
                    type: "string",
                    enum: recommendationVariants.map((variant) => variant.type)
                  },
                  summary: { type: "string" },
                  reason: { type: "string" },
                  riskNotice: { type: "string" },
                  alternativeSuggestion: { type: "string" }
                },
                required: ["type", "summary", "reason", "riskNotice", "alternativeSuggestion"]
              }
            }
          },
          required: ["courses"]
        },
        instructions:
          "서울 데이트 코스 추천 결과를 한국어로 설명하세요. 제공된 각 course만 설명하고 장소를 새로 만들지 마세요. 내부 추론은 출력하지 말고, 동선/예산/날씨/혼잡도/첫 만남 적합성을 짧고 구체적으로 설명하세요.",
        input: JSON.stringify({
          request: state.parsedRequest,
          context: state.contextData,
          riskNotices: state.riskNotices,
          courses: variants.map((variant) => ({
            type: variant.type,
            title: variant.course.title,
            estimatedBudget: variant.course.estimatedBudget,
            duration: courseDuration(variant.course.places),
            places: variant.course.places.map((place) => ({
              order: place.order,
              title: place.title,
              category: place.category,
              moveTimeMinute: place.moveTimeMinute,
              estimatedCost: place.estimatedCost
            }))
          }))
        }),
        maxOutputTokens: 1200
      }),
      3500,
      "course explanation generation timed out"
    );

    const explanationByType = new Map(
      response.courses.map((course) => [
        course.type,
        {
          summary: course.summary,
          reason: course.reason,
          riskNotice: course.riskNotice || undefined,
          alternativeSuggestion: course.alternativeSuggestion || undefined
        } satisfies AiExplanation
      ])
    );

    return variants.map((variant) => ({
      ...variant,
      explanation: explanationByType.get(variant.type) ?? fallbackVariantExplanation(state, variant)
    }));
  } catch {
    return variants.map((variant) => ({
      ...variant,
      explanation: fallbackVariantExplanation(state, variant)
    }));
  }
};

const saveBuiltCourseVariant = async (
  state: SeoulMateGraphState,
  graphInput: ReturnType<typeof buildStructuredRecommendationInput>,
  userId: number,
  variant: BuiltCourseVariant
): Promise<BuiltCourseVariant> => {
  const request = await recommendationRepository.createRequest({
    userId,
    requestText:
      variant.type === "best"
        ? graphInput.rawInput
        : `${graphInput.rawInput} / variant:${variant.type}`,
    preferredRegion: state.parsedRequest?.region ?? null,
    preferredCategory: serializePreferredCategory(state.parsedRequest?.preferredCategories),
    budget: state.parsedRequest?.budget ?? null,
    companion: state.parsedRequest?.purpose ?? null,
    transportMode: "walking",
    status: "pending",
    courseTitle: variant.course.title,
    courseDurationMinutes: courseDuration(variant.course.places),
    courseCongestion: resolveCourseCongestion(state.contextData),
    courseDescription: variant.explanation?.summary ?? variant.explanation?.reason ?? null,
    courseEstimatedBudget: variant.course.estimatedBudget
  });

  weatherSnapshotByRequestId.set(request.id, toWeatherResponse(state.contextData?.weather));

  if (variant.course.places.length) {
    await recommendationRepository.createItems(
      variant.course.places.map((place) => ({
        requestId: request.id,
        userId,
        publicDataId: place.placeId,
        courseOrder: place.order,
        score: getScore(state.scoredPlaces, place.placeId),
        reason: variant.explanation?.summary ?? variant.explanation?.reason ?? null,
        travelMinutes: place.moveTimeMinute ?? null,
        estimatedCost:
          place.estimatedCost ??
          getCandidate(state.candidatePlaces, place.placeId)?.estimatedCost ??
          null
      }))
    );
    await recommendationRepository.updateRequestStatus(request.id, "completed");
  } else {
    await recommendationRepository.updateRequestStatus(request.id, "failed");
  }

  return {
    ...variant,
    requestId: request.id
  };
};

const toCourseResponseFromVariant = (
  variant: BuiltCourseVariant,
  context?: RecommendationContextData,
  meta?: {
    recommendationRank?: number;
    isRecommended?: boolean;
  }
): CourseResponse => ({
  id: variant.requestId ? `crs_${variant.requestId}` : "crs_preview",
  title: variant.course.title,
  description: variant.explanation?.summary ?? variant.explanation?.reason,
  recommendationRank: meta?.recommendationRank,
  recommendationType: variant.type,
  isRecommended: meta?.isRecommended,
  totalCost: variant.course.estimatedBudget,
  duration: courseDuration(variant.course.places),
  congestion: resolveCourseCongestion(context),
  weather: toWeatherResponse(context?.weather),
  places: variant.course.places.map((place) => ({
    id: `plc_${place.placeId}`,
    name: place.title,
    lat: place.latitude ?? null,
    lng: place.longitude ?? null,
    order: place.order
  }))
});

const estimateStayDuration = (item: RecommendationItem): number => {
  if (item.travelMinutes && item.travelMinutes > 0) {
    return Math.max(30, 60 - Math.min(item.travelMinutes, 30));
  }

  return 60;
};

const toCongestion = (value: string | null): CourseResponse["congestion"] => {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "unknown";
};

const toCourseResponseFromDetail = (detail: CourseDetail): CourseResponse => {
  const totalCost =
    detail.request.courseEstimatedBudget ??
    detail.items.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0);
  const duration =
    detail.request.courseDurationMinutes ??
    detail.items.reduce(
      (sum, item) => sum + estimateStayDuration(item) + (item.travelMinutes ?? 0),
      0
    );
  const title = detail.request.courseTitle ?? `${detail.request.preferredRegion ?? "서울"} 코스`;
  const description =
    detail.request.courseDescription ??
    detail.items.find((item) => item.reason)?.reason ??
    "추천 코스입니다.";

  return {
    id: `crs_${detail.request.id}`,
    title,
    description,
    totalCost,
    duration,
    congestion: toCongestion(detail.request.courseCongestion),
    weather: weatherSnapshotByRequestId.get(detail.request.id) ?? toWeatherResponse(),
    places: detail.items.map((item, index) => {
      const cost = item.estimatedCost ?? 0;
      return {
        id: `plc_${item.publicDataId}`,
        name: item.place?.title ?? `장소 ${item.publicDataId}`,
        lat: item.place?.latitude ?? null,
        lng: item.place?.longitude ?? null,
        order: item.courseOrder ?? index + 1,
        stayDuration: estimateStayDuration(item),
        priceMin: cost,
        priceMax: cost,
        reason: item.reason ?? description
      };
    })
  };
};

export const recommendationService = {
  async recommendCourse(
    payload: string | RecommendCoursePayload,
    userId?: number
  ): Promise<RecommendationResult> {
    const graphInput =
      typeof payload === "string"
        ? { rawInput: payload }
        : buildStructuredRecommendationInput(payload);
    const state = await runRecommendationGraph(graphInput.rawInput, graphInput.parsedRequest);
    let requestId: number | undefined;

    if (userId) {
      const request = await recommendationRepository.createRequest({
        userId,
        requestText: graphInput.rawInput,
        preferredRegion: state.parsedRequest?.region ?? null,
        preferredCategory: serializePreferredCategory(state.parsedRequest?.preferredCategories),
        budget: state.parsedRequest?.budget ?? null,
        companion: state.parsedRequest?.purpose ?? null,
        transportMode: "walking",
        status: "pending",
        courseTitle: state.course?.title ?? null,
        courseDurationMinutes: state.course ? courseDuration(state.course.places) : null,
        courseCongestion: state.course ? resolveCourseCongestion(state.contextData) : null,
        courseDescription: state.aiExplanation?.summary ?? state.aiExplanation?.reason ?? null,
        courseEstimatedBudget: state.course?.estimatedBudget ?? null
      });
      requestId = request.id;
      weatherSnapshotByRequestId.set(request.id, toWeatherResponse(state.contextData?.weather));

      if (state.course?.places.length) {
        await recommendationRepository.createItems(
          state.course.places.map((place) => ({
            requestId: request.id,
            userId,
            publicDataId: place.placeId,
            courseOrder: place.order,
            score: getScore(state.scoredPlaces, place.placeId),
            reason: state.aiExplanation?.summary ?? state.aiExplanation?.reason ?? null,
            travelMinutes: place.moveTimeMinute ?? null,
            estimatedCost:
              place.estimatedCost ??
              getCandidate(state.candidatePlaces, place.placeId)?.estimatedCost ??
              null
          }))
        );
        await recommendationRepository.updateRequestStatus(request.id, "completed");
      } else {
        await recommendationRepository.updateRequestStatus(request.id, "failed");
      }
    }

    return {
      requestId,
      request: {
        rawInput: state.rawInput,
        parsed: state.parsedRequest
      },
      course: state.course,
      explanation: state.aiExplanation,
      context: state.contextData,
      scores: state.scoredPlaces,
      validation: state.validation,
      riskNotices: state.riskNotices ?? [],
      warnings: [...new Set(state.warnings ?? [])],
      finalRecommendation: state.finalRecommendation,
      candidateCount: state.candidatePlaces?.length ?? 0,
      errors: state.errors ?? []
    };
  },

  async recommendCoursesForApi(
    payload: RecommendCoursePayload,
    userId: number
  ): Promise<RecommendCoursesResponse> {
    const graphInput = buildStructuredRecommendationInput(payload);
    const state = await runRecommendationGraphWithoutAiExplanation(
      graphInput.rawInput,
      graphInput.parsedRequest
    );
    const targetCourseCount = (state.candidatePlaces?.length ?? 0) >= 30 ? 4 : 3;
    const builtVariants: BuiltCourseVariant[] = [];
    const seenSignatures = new Set<string>();

    for (const variant of recommendationVariants.slice(0, targetCourseCount)) {
      const course = await buildCourseVariant(state, variant.type);
      if (!course?.places.length) {
        continue;
      }

      const signature = course.places
        .map((place) => place.placeId)
        .sort((left, right) => left - right)
        .join("|");

      if (signature && !seenSignatures.has(signature)) {
        seenSignatures.add(signature);
        builtVariants.push({ type: variant.type, course });
      }
    }

    const explainedVariants = await attachBatchExplanations(state, builtVariants);
    const savedVariants = await Promise.all(
      explainedVariants.map((variant) => saveBuiltCourseVariant(state, graphInput, userId, variant))
    );
    const warnings = uniqueStringArray(state.warnings ?? []);
    const courses = savedVariants
      .map((variant) => toCourseResponseFromVariant(variant, state.contextData))
      .sort(
        (left, right) =>
          scoreApiCourse(right, state.parsedRequest?.budget, state.parsedRequest?.durationHours) -
          scoreApiCourse(left, state.parsedRequest?.budget, state.parsedRequest?.durationHours)
      )
      .map((course, index) => ({
        ...course,
        recommendationRank: index + 1,
        isRecommended: index === 0
      }));

    const response: RecommendCoursesResponse = {
      courses
    };

    if (courses[0]) {
      response.recommendedCourseId = courses[0].id;
    }

    if (warnings.length) {
      response.warnings = warnings;
    }

    return response;
  },

  async getCourse(courseId: number, userId: number): Promise<CourseDetail> {
    const request = assertOwnRequest(
      await recommendationRepository.getRequestById(courseId),
      userId
    );
    return buildCourseDetail(request);
  },

  async getCourseForApi(courseId: number, userId: number): Promise<CourseResponse> {
    return toCourseResponseFromDetail(await this.getCourse(courseId, userId));
  },

  async listMyCourses(
    userId: number,
    params: { page?: number; pageSize?: number }
  ): Promise<CourseDetail[]> {
    const requests = await recommendationRepository.listRequestsByUser(userId, params);
    return Promise.all(requests.map((request) => buildCourseDetail(request)));
  },

  async listMyCoursesForApi(
    userId: number,
    params: { page?: number; pageSize?: number }
  ): Promise<PagedCoursesResponse> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 10, 50));
    const [details, total] = await Promise.all([
      this.listMyCourses(userId, { page, pageSize }),
      recommendationRepository.countRequestsByUser(userId)
    ]);

    return {
      data: details.map(toCourseResponseFromDetail),
      total,
      page,
      page_size: pageSize
    };
  },

  async saveCourse(userId: number, courseId: number, notes?: string | null): Promise<CourseDetail> {
    const request = assertOwnRequest(
      await recommendationRepository.getRequestById(courseId),
      userId
    );
    const existing = await recommendationRepository.getSavedCourse(userId, request.id);
    if (existing) {
      throw new ApiError(409, "이미 저장된 코스입니다.");
    }

    const saved = await recommendationRepository.saveCourse(userId, request.id, notes);
    return buildCourseDetail(request, saved);
  },

  async removeSavedCourse(userId: number, courseId: number): Promise<{ removed: boolean }> {
    assertOwnRequest(await recommendationRepository.getRequestById(courseId), userId);
    const removed = await recommendationRepository.removeSavedCourse(userId, courseId);
    if (!removed) {
      throw new ApiError(404, "저장된 코스를 찾을 수 없습니다.");
    }

    return { removed };
  },

  async listSavedCourses(
    userId: number,
    params: { page?: number; pageSize?: number } = {}
  ): Promise<CourseDetail[]> {
    const savedCourses = await recommendationRepository.listSavedCourses(userId, params);
    return Promise.all(
      savedCourses.map(async (saved) => {
        const request = assertOwnRequest(
          await recommendationRepository.getRequestById(saved.requestId),
          userId
        );
        return buildCourseDetail(request, saved);
      })
    );
  },

  async listSavedCoursesForApi(
    userId: number,
    params: { page?: number; pageSize?: number }
  ): Promise<PagedCoursesResponse> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 10, 50));
    const [details, total] = await Promise.all([
      this.listSavedCourses(userId, { page, pageSize }),
      recommendationRepository.countSavedCourses(userId)
    ]);

    return {
      data: details.map(toCourseResponseFromDetail),
      total,
      page,
      page_size: pageSize
    };
  }
};
