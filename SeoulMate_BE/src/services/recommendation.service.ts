import { mapClient } from "../clients/map.client";
import {
  runRecommendationGraph,
  runRecommendationGraphForApi
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
import { isValidSeoulCoordinate } from "../utils/coordinates";

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
  mapUrl?: string | null;
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

export type RecommendationType =
  | "best"
  | "balanced"
  | "indoor"
  | "low-budget"
  | "short-walk"
  | "mood-quiet"
  | "mood-hip"
  | "mood-poetic"
  | "mood-romantic"
  | "mood-lively"
  | "mood-calm"
  | "mood-modern"
  | "mood-emotional"
  | "mood-nature";

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
  mood?: string;
};

type CourseRole =
  | "cafe"
  | "culture"
  | "walk"
  | "food"
  | "nightlife"
  | "karaoke"
  | "activity"
  | "camping"
  | "amusement"
  | "attraction";

type BuiltCourseVariant = {
  type: RecommendationType;
  course: RecommendationCourse;
  explanation?: AiExplanation;
  requestId?: number;
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

const resolvePlaceMapUrl = (
  place:
    | Pick<PublicDataset, "kakaoPlaceUrl" | "sourceUrl">
    | Pick<CandidatePlace, "mapVerification" | "mapUrl" | "sourceUrl">
    | null
    | undefined
): string | null => {
  if (!place) {
    return null;
  }

  if ("kakaoPlaceUrl" in place) {
    return place.kakaoPlaceUrl ?? place.sourceUrl ?? null;
  }

  return place.mapVerification?.placeUrl ?? place.mapUrl ?? place.sourceUrl ?? null;
};

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

const MOOD_VARIANT_BY_MOOD: Record<string, RecommendationType> = {
  조용한: "mood-quiet",
  힙한: "mood-hip",
  낭만적인: "mood-poetic",
  로맨틱: "mood-romantic",
  활기찬: "mood-lively",
  고즈넉한: "mood-calm",
  현대적인: "mood-modern",
  감성적인: "mood-emotional",
  자연친화적: "mood-nature"
};

const buildRecommendationVariants = (moods: string[] = []): RecommendationVariant[] => {
  if (!moods.length) {
    return [{ type: "best" }, { type: "balanced" }, { type: "indoor" }, { type: "low-budget" }];
  }

  const moodVariants = moods
    .map((mood): RecommendationVariant | undefined => {
      const type = MOOD_VARIANT_BY_MOOD[mood];
      return type ? { type, mood } : undefined;
    })
    .filter((variant): variant is RecommendationVariant => Boolean(variant));

  const uniqueMoodVariants = [
    ...new Map(moodVariants.map((variant) => [variant.type, variant])).values()
  ];

  return [...uniqueMoodVariants, { type: "best" as const }].slice(0, 4);
};

const uniqueStringArray = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

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

const NIGHTLIFE_KEYWORDS = [
  "\uc220\uc9d1",
  "2\ucc28",
  "\ud638\ud504\uc9d1",
  "\uc8fc\uc810",
  "\ud638\ud504",
  "\ud3ec\ucc28",
  "\ub9e5\uc8fc",
  "\uc640\uc778",
  "\uce75\ud14c\uc77c",
  "\uc774\uc790\uce74\uc57c",
  "\ud38d",
  "\ud558\uc774\ubcfc",
  "\ub9c9\uac78\ub9ac",
  "\ub9c9\uac78\ub9ac\uc9d1",
  "\uc804\ud1b5\uc8fc\uc810",
  "\ub8e8\ud504\ud0d1\ubc14",
  "\ud63c\uc220",
  "\uac10\uc131\uc8fc\uc810",
  "\ud074\ub7fd",
  "\ub098\uc774\ud2b8",
  "\uc815\uc885/\ub300\ud3ec\uc9d1/\uc18c\uc8fc\ubc29",
  "\ud638\ud504/\ud1b5\ub2ed",
  "lp\ubc14",
  "\uc5d8\ud53c\ubc14",
  "lp bar",
  "\uc7ac\uc988\ubc14",
  "jazz bar",
  "\uc640\uc778\ubc14",
  "wine bar",
  "\uce75\ud14c\uc77c\ubc14",
  "cocktail bar",
  "club",
  "bar",
  "pub"
];

const CHICKEN_PIZZA_KEYWORDS = [
  "\uce58\ud0a8",
  "\ud1b5\ub2ed",
  "\ud53c\uc790",
  "\ud53c\uc790\uc9d1",
  "chicken",
  "pizza"
];

const KARAOKE_KEYWORDS = [
  "\ub178\ub798\ubc29",
  "\ub178\ub798\uc5f0\uc2b5\uc7a5",
  "\ucf54\uc778\ub178\ub798\ubc29",
  "\ub3d9\uc804\ub178\ub798\uc5f0\uc2b5\uc7a5",
  "karaoke"
];

const ACTIVITY_KEYWORDS = [
  "\ubc29\ud0c8\ucd9c",
  "\ubcf4\ub4dc\uac8c\uc784",
  "\ubcf4\ub4dc\uac8c\uc784\uce74\ud398",
  "\ucc1c\uc9c8\ubc29",
  "\ubcfc\ub9c1",
  "\ub2f9\uad6c",
  "\ub2f9\uad6c\uc7a5",
  "\ub9cc\ud654\uce74\ud398",
  "\uacf5\ubc29",
  "\uc6d0\ub370\uc774\ud074\ub798\uc2a4",
  "\ud5a5\uc218",
  "\ub3c4\uc790\uae30",
  "\ud074\ub77c\uc774\ubc0d",
  "vr",
  "\uc544\ucf00\uc774\ub4dc",
  "\uc2e4\ub0b4\ub180\uac70\ub9ac",
  "\uc561\ud2f0\ube44\ud2f0",
  "\uccb4\ud5d8",
  "\ubcf5\ud569\uc720\ud1b5\uac8c\uc784\uc81c\uacf5\uc5c5",
  "\uccb4\ub825\ub2e8\ub828\uc7a5\uc5c5"
];

const CAMPING_KEYWORDS = [
  "\ucea0\ud551",
  "\ucea0\ud551\uc7a5",
  "\uc57c\uc601",
  "\uae00\ub7a8\ud551",
  "\ubc14\ubca0\ud050",
  "\ud53c\ud06c\ub2c9\uc7a5",
  "\ud53c\ud06c\ub2c9"
];

const AMUSEMENT_KEYWORDS = [
  "\ub180\uc774\uc2dc\uc124",
  "\ub180\uc774\uacf5\uc6d0",
  "\ud14c\ub9c8\ud30c\ud06c",
  "\uc5b4\ud2b8\ub799\uc158",
  "\uc6cc\ud130\ud30c\ud06c",
  "\uc5b4\ub4dc\ubca4\ucc98",
  "\ub86f\ub370\uc6d4\ub4dc",
  "\uc5b4\ub9b0\uc774\ub300\uacf5\uc6d0",
  "\ud5c8\uac00\ud14c\ub9c8\ud30c\ud06c\uc5c5"
];

const AMUSEMENT_REGION_HINTS = [
  "\uc7a0\uc2e4",
  "\uc1a1\ud30c",
  "\ub86f\ub370\uc6d4\ub4dc",
  "\uc5b4\ub9b0\uc774\ub300\uacf5\uc6d0",
  "\ub2a5\ub3d9",
  "\uad11\uc9c4",
  "\ubb38\uc815",
  "\ud30c\ud06c\ud558\ube44\uc624",
  "\uc6cc\ud130\ud0b9\ub364"
];

const isIndoorVariantPlace = (place: CandidatePlace): boolean => {
  const text = placeSearchText(place);
  return textIncludesAny(text, [
    "cafe",
    "restaurant",
    "카페",
    "커피",
    "디저트",
    "베이커리",
    "전시",
    "문화",
    "공연",
    "박물관",
    "미술관",
    "갤러리",
    "공간",
    "식당",
    "음식",
    "맛집",
    "실내",
    "서점",
    "영화관"
  ]);
};

const isOutdoorVariantPlace = (place: CandidatePlace): boolean => {
  const text = placeSearchText(place);
  return textIncludesAny(text, ["공원", "산책", "자연", "야외", "둘레길", "한강", "숲", "하천"]);
};

const moodAffinityScore = (place: CandidatePlace, mood?: string): number => {
  if (!mood) {
    return 0;
  }

  const text = placeSearchText(place);
  if (mood.includes("힙")) {
    return textIncludesAny(text, [
      "성수",
      "홍대",
      "연남",
      "한남",
      "편집샵",
      "팝업",
      "복합",
      "갤러리",
      "카페",
      "전시"
    ])
      ? 3
      : 0;
  }

  if (mood.includes("로맨틱") || mood.includes("낭만")) {
    return textIncludesAny(text, [
      "야경",
      "한강",
      "전망",
      "공원",
      "산책",
      "카페",
      "갤러리",
      "문화",
      "데이트"
    ])
      ? 3
      : 0;
  }

  if (mood.includes("고즈넉") || mood.includes("조용")) {
    return textIncludesAny(text, [
      "궁",
      "한옥",
      "북촌",
      "서촌",
      "공원",
      "산책",
      "박물관",
      "미술관",
      "서점",
      "문화"
    ])
      ? 3
      : isIndoorVariantPlace(place)
        ? 1
        : 0;
  }

  if (mood.includes("현대")) {
    return textIncludesAny(text, [
      "ddp",
      "디자인",
      "현대",
      "복합",
      "미술관",
      "전시",
      "갤러리",
      "공간"
    ])
      ? 3
      : 0;
  }

  if (mood.includes("감성")) {
    return textIncludesAny(text, ["카페", "갤러리", "전시", "문화", "서점", "디저트", "공간"])
      ? 3
      : 0;
  }

  if (mood.includes("자연친화")) {
    return isOutdoorVariantPlace(place) ? 3 : 0;
  }

  if (mood.includes("활기")) {
    return textIncludesAny(text, ["거리", "시장", "맛집", "관광", "상권", "홍대", "명동", "강남"])
      ? 3
      : 0;
  }

  return 0;
};

const normalizeVariantPlaceTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^가-힣a-z0-9]/g, "");

const inferVariantRole = (place: CandidatePlace): CourseRole => {
  const text = placeSearchText(place);

  if (textIncludesAny(text, NIGHTLIFE_KEYWORDS)) {
    return "nightlife";
  }

  if (textIncludesAny(text, KARAOKE_KEYWORDS)) {
    return "karaoke";
  }

  if (textIncludesAny(text, ACTIVITY_KEYWORDS)) {
    return "activity";
  }

  if (textIncludesAny(text, CAMPING_KEYWORDS)) {
    return "camping";
  }

  if (textIncludesAny(text, AMUSEMENT_KEYWORDS)) {
    return "amusement";
  }

  if (textIncludesAny(text, ["restaurant", "음식", "식당", "맛집", "한식", "양식", "일식"])) {
    return "food";
  }

  if (textIncludesAny(text, CHICKEN_PIZZA_KEYWORDS)) {
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
    nightlife: "\uc220\uc9d1",
    karaoke: "\ub178\ub798\ubc29",
    activity: "\uc2e4\ub0b4\ub180\uac70\ub9ac",
    camping: "\ucea0\ud551\uc7a5",
    amusement: "\ub180\uc774\uc2dc\uc124",
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
    nightlife: 75,
    karaoke: 70,
    activity: 80,
    camping: 180,
    amusement: 180,
    attraction: 45
  };
  const defaultDurations: Record<CourseRole, number> = {
    cafe: 60,
    culture: 80,
    walk: 50,
    food: 70,
    nightlife: 90,
    karaoke: 80,
    activity: 90,
    camping: 210,
    amusement: 210,
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
  if (role === "nightlife") return 18000;
  if (role === "karaoke") return 12000;
  if (role === "activity") return 18000;
  if (role === "camping") return 20000;
  if (role === "amusement") return 30000;
  return 8000;
};

const hasCoordinate = (place: CandidatePlace): boolean =>
  isValidSeoulCoordinate(place.latitude, place.longitude);

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

const specialRolesFromCategories = (categories: string[] = []): CourseRole[] => {
  const roles: CourseRole[] = [];
  const pushRole = (role: CourseRole): void => {
    if (!roles.includes(role)) {
      roles.push(role);
    }
  };

  for (const category of categories) {
    const normalized = category.toLowerCase();
    if (textIncludesAny(normalized, NIGHTLIFE_KEYWORDS)) {
      pushRole("nightlife");
    }
    if (textIncludesAny(normalized, KARAOKE_KEYWORDS)) {
      pushRole("karaoke");
    }
    if (textIncludesAny(normalized, ACTIVITY_KEYWORDS)) {
      pushRole("activity");
    }
    if (textIncludesAny(normalized, CAMPING_KEYWORDS)) {
      pushRole("camping");
    }
    if (textIncludesAny(normalized, AMUSEMENT_KEYWORDS)) {
      pushRole("amusement");
    }
  }

  return roles;
};

const shouldPreferAmusementRole = (request?: ParsedRecommendationRequest): boolean => {
  const mood = request?.mood ?? [];
  const region = request?.region ?? "";
  const durationHours = request?.durationHours ?? 0;
  const budget = request?.budget;
  const hasLivelyMood = mood.some((item) => item.includes("\ud65c\uae30"));
  const isAmusementArea = AMUSEMENT_REGION_HINTS.some((hint) => region.includes(hint));
  const hasEnoughDuration = durationHours >= 4;
  const hasEnoughBudget = budget === undefined || budget === OPEN_ENDED_BUDGET || budget >= 30000;

  return hasLivelyMood && isAmusementArea && hasEnoughDuration && hasEnoughBudget;
};

const specialRolesFromRequest = (request?: ParsedRecommendationRequest): CourseRole[] => {
  const roles = specialRolesFromCategories(request?.preferredCategories);
  if (shouldPreferAmusementRole(request) && !roles.includes("amusement")) {
    roles.push("amusement");
  }

  return roles;
};

const uniquePlacesById = (places: CandidatePlace[]): CandidatePlace[] => [
  ...new Map(places.map((place) => [place.id, place])).values()
];

const sortCandidatesForVariant = (
  candidates: CandidatePlace[],
  scores: ScoredRecommendationPlace[] | undefined,
  variant: RecommendationType,
  mood?: string,
  requiredRoles: CourseRole[] = []
): CandidatePlace[] => {
  const scoreById = new Map(scores?.map((score) => [score.placeId, score.totalScore]) ?? []);
  const requiredCandidates = requiredRoles.length
    ? candidates.filter((place) => requiredRoles.some((role) => roleMatchesVariant(role, place)))
    : [];
  const moodCandidates = mood
    ? candidates.filter((place) => moodAffinityScore(place, mood) > 0)
    : [];
  const baseCandidates =
    variant === "indoor"
      ? candidates.filter(isIndoorVariantPlace)
      : requiredCandidates.length || moodCandidates.length
        ? uniquePlacesById([...requiredCandidates, ...moodCandidates])
        : candidates;
  const pool =
    variant === "indoor" ? baseCandidates : baseCandidates.length ? baseCandidates : candidates;

  return [...pool].sort((left, right) => {
    const moodDiff = moodAffinityScore(right, mood) - moodAffinityScore(left, mood);
    if (moodDiff !== 0) {
      return moodDiff;
    }

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
  preferNearest = false,
  options: { strictIndoor?: boolean; mood?: string } = {}
): CandidatePlace | undefined => {
  const available = pool.filter(
    (place) =>
      !usedIds.has(place.id) &&
      !usedTitles.has(normalizeVariantPlaceTitle(place.title)) &&
      (remainingBudget === undefined || estimateVariantCost(place) <= remainingBudget) &&
      (!options.strictIndoor || isIndoorVariantPlace(place))
  );
  const matched = available.filter((place) => roleMatchesVariant(role, place));
  const moodMatched = options.mood
    ? available.filter((place) => moodAffinityScore(place, options.mood) > 0)
    : [];
  const rawPool = matched.length ? matched : moodMatched.length ? moodMatched : available;
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
  "short-walk": ["cafe", "culture", "food", "cafe", "culture", "attraction", "food", "cafe"],
  "mood-quiet": ["cafe", "culture", "walk", "cafe", "culture", "food", "attraction", "cafe"],
  "mood-hip": ["cafe", "culture", "attraction", "food", "cafe", "culture", "food", "attraction"],
  "mood-poetic": ["walk", "cafe", "culture", "food", "attraction", "walk", "cafe", "culture"],
  "mood-romantic": ["cafe", "walk", "culture", "food", "attraction", "cafe", "walk", "food"],
  "mood-lively": ["attraction", "food", "cafe", "culture", "food", "attraction", "cafe", "walk"],
  "mood-calm": ["culture", "walk", "cafe", "attraction", "food", "culture", "walk", "cafe"],
  "mood-modern": ["culture", "cafe", "attraction", "food", "culture", "cafe", "attraction", "food"],
  "mood-emotional": ["cafe", "culture", "cafe", "walk", "food", "culture", "cafe", "attraction"],
  "mood-nature": ["walk", "cafe", "attraction", "food", "walk", "culture", "cafe", "walk"]
};

const buildVariantTitle = (
  state: SeoulMateGraphState,
  type: RecommendationType,
  mood?: string
): string => {
  const region = state.parsedRequest?.region ?? "서울";
  const purpose = state.parsedRequest?.purpose ?? "데이트";
  const label: Record<RecommendationType, string> = {
    best: "추천",
    balanced: "균형형",
    indoor: "실내 중심",
    "low-budget": "가성비",
    "short-walk": "이동 적은",
    "mood-quiet": mood ?? "조용한",
    "mood-hip": mood ?? "힙한",
    "mood-poetic": mood ?? "낭만적인",
    "mood-romantic": mood ?? "로맨틱",
    "mood-lively": mood ?? "활기찬",
    "mood-calm": mood ?? "고즈넉한",
    "mood-modern": mood ?? "현대적인",
    "mood-emotional": mood ?? "감성적인",
    "mood-nature": mood ?? "자연친화적"
  };

  return type === "best"
    ? `${region} AI 추천 ${purpose} 코스`
    : `${region} ${label[type]} ${purpose} 코스`;
};

const buildCourseVariant = async (
  state: SeoulMateGraphState,
  variant: RecommendationVariant,
  excludedPlaceIds: Set<number> = new Set()
): Promise<RecommendationCourse | null> => {
  const { type, mood } = variant;
  const allCandidates = state.candidatePlaces ?? [];
  const freshCandidates = allCandidates.filter((place) => !excludedPlaceIds.has(place.id));
  const candidates = freshCandidates.length >= 4 ? freshCandidates : allCandidates;
  if (!candidates.length) {
    return null;
  }

  const durationHours = state.parsedRequest?.durationHours ?? 3;
  const placeCountRange = resolvePlaceCountRange(durationHours);
  const requestedSpecialRoles = specialRolesFromRequest(state.parsedRequest);
  const roles = [
    ...requestedSpecialRoles,
    ...variantRoles[type].filter((role) => !requestedSpecialRoles.includes(role))
  ].slice(0, Math.max(placeCountRange.max, requestedSpecialRoles.length));
  const sortedCandidates = sortCandidatesForVariant(
    candidates,
    state.scoredPlaces,
    type,
    mood,
    requestedSpecialRoles
  );
  if (!sortedCandidates.length) {
    return null;
  }

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
      requestedSpecialRoles.includes(role) ? undefined : remainingBudget,
      selected[selected.length - 1]?.place,
      type === "short-walk" || type === "balanced",
      { strictIndoor: type === "indoor", mood }
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
    title: buildVariantTitle(state, type, mood),
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
    summary: `${variant.course.title}: ${placeNames} 순서로 이동 부담을 고려해 구성했습니다.`,
    reason: `${costText} 같은 후보 데이터와 실시간 컨텍스트 안에서 ${variant.type} 성격에 맞게 장소 유형과 동선을 다르게 조합했습니다.`,
    riskNotice: state.riskNotices?.join(" / ") ?? "",
    alternativeSuggestion:
      state.contextData?.weather?.rainProbability && state.contextData.weather.rainProbability >= 60
        ? "비 예보가 있어 실내 비중이 높은 코스도 함께 확인하는 것을 권장합니다."
        : "혼잡도가 높아지면 가까운 실내 장소 중심으로 순서를 조정할 수 있습니다."
  };
};

const attachBatchExplanations = async (
  state: SeoulMateGraphState,
  variants: BuiltCourseVariant[]
): Promise<BuiltCourseVariant[]> => {
  return variants.map((variant) => ({
    ...variant,
    explanation: fallbackVariantExplanation(state, variant)
  }));
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
  candidates: CandidatePlace[] | undefined,
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
    mapUrl: resolvePlaceMapUrl(getCandidate(candidates, place.placeId)),
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
        mapUrl: resolvePlaceMapUrl(item.place),
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
    const state = await runRecommendationGraphForApi(graphInput.rawInput, graphInput.parsedRequest);
    const recommendationVariants = buildRecommendationVariants(state.parsedRequest?.mood);
    const builtVariants: BuiltCourseVariant[] = [];
    const seenSignatures = new Set<string>();
    const globallyUsedPlaceIds = new Set<number>();

    for (const variant of recommendationVariants) {
      const course = await buildCourseVariant(state, variant, globallyUsedPlaceIds);
      if (!course?.places.length) {
        continue;
      }

      const placeIds = course.places.map((place) => place.placeId);
      const duplicateCount = placeIds.filter((placeId) => globallyUsedPlaceIds.has(placeId)).length;
      if (builtVariants.length && duplicateCount / Math.max(placeIds.length, 1) >= 0.5) {
        continue;
      }

      const signature = placeIds.sort((left, right) => left - right).join("|");

      if (signature && !seenSignatures.has(signature)) {
        seenSignatures.add(signature);
        placeIds.forEach((placeId) => globallyUsedPlaceIds.add(placeId));
        builtVariants.push({ type: variant.type, course });
      }
    }

    const explainedVariants = await attachBatchExplanations(state, builtVariants);
    const savedVariants = await Promise.all(
      explainedVariants.map((variant) => saveBuiltCourseVariant(state, graphInput, userId, variant))
    );
    const warnings = uniqueStringArray(state.warnings ?? []);
    const courses = savedVariants
      .map((variant) =>
        toCourseResponseFromVariant(variant, state.candidatePlaces, state.contextData)
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
