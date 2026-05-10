import { runRecommendationGraph } from "../graphs/recommendation.graph";
import type {
  AiExplanation,
  CandidatePlace,
  CongestionLevel,
  ParsedRecommendationRequest,
  RecommendationContextData,
  RecommendationCourse,
  RecommendationCoursePlace,
  RecommendationValidation,
  ScoredRecommendationPlace
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
  queryHint: string;
  vibes: string[];
  budgetRatio?: number;
  purposeHint?: string;
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

const durationToHours = (duration?: string): number | undefined => {
  if (!duration) {
    return undefined;
  }

  const normalized = duration.trim().toLowerCase();
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
  hours ? `${hours}시간` : undefined;

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
  const budget = Number(payload.budget);
  const durationHours = durationToHours(payload.duration);
  const vibes = normalizeStringArray(payload.vibes, "vibes", true);
  const dateTime = readRequestDateTime(payload.dateTime);
  const purpose = typeof payload.purpose === "string" ? payload.purpose.trim() : undefined;
  const query = typeof payload.query === "string" ? payload.query.trim() : legacyInput;

  if (!region) {
    throw new ApiError(400, "region 값은 필수입니다.");
  }

  if (!Number.isFinite(budget) || budget <= 0) {
    throw new ApiError(400, "budget 값은 양수여야 합니다.");
  }

  if (!durationHours) {
    throw new ApiError(400, "duration 값은 2h, half-day, full-day 중 하나여야 합니다.");
  }

  const structuredText = [
    query,
    `${region}에서`,
    `${budget}원 이하`,
    durationHoursToText(durationHours),
    vibes.length ? `${vibes.join(", ")} 분위기` : undefined,
    purpose
  ]
    .filter(Boolean)
    .join(" / ");

  const parsedRequest: ParsedRecommendationRequest = {
    region,
    budget: Math.round(budget),
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
  {
    type: "best",
    queryHint: "Build the most date-friendly course with a natural route and mixed place types.",
    vibes: []
  },
  {
    type: "balanced",
    queryHint:
      "Build a balanced course with cafe, culture or walk, and meal. Avoid repeating the same category.",
    vibes: ["balanced"],
    purposeHint: "balanced date course"
  },
  {
    type: "indoor",
    queryHint:
      "Build an indoor-friendly course for bad weather or high congestion. Prefer exhibitions, culture spaces, and calm cafes.",
    vibes: ["indoor", "calm"],
    purposeHint: "indoor alternative date course"
  },
  {
    type: "low-budget",
    queryHint:
      "Build a lower-budget course with short travel and affordable places while keeping the date atmosphere.",
    vibes: ["low-budget", "casual"],
    budgetRatio: 0.85,
    purposeHint: "low budget date course"
  },
  {
    type: "short-walk",
    queryHint: "Build a course with the shortest reasonable movement path and low walking fatigue.",
    vibes: ["short-walk", "comfortable"],
    purposeHint: "short movement date course"
  }
];

const uniqueStringArray = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

const appendHint = (value: string | undefined, hint: string): string =>
  [value?.trim(), hint].filter(Boolean).join(" / ");

const buildVariantPayload = (
  payload: RecommendCoursePayload,
  variant: RecommendationVariant
): RecommendCoursePayload => {
  const next: RecommendCoursePayload = {
    ...payload,
    vibes: uniqueStringArray([...(payload.vibes ?? []), ...variant.vibes])
  };

  if (typeof payload.query === "string" || typeof payload.input !== "string") {
    next.query = appendHint(payload.query ?? payload.input, variant.queryHint);
  } else {
    next.input = appendHint(payload.input, variant.queryHint);
  }

  if (
    variant.budgetRatio &&
    typeof payload.budget === "number" &&
    Number.isFinite(payload.budget)
  ) {
    next.budget = Math.max(10000, Math.round(payload.budget * variant.budgetRatio));
  }

  if (variant.purposeHint) {
    next.purpose = appendHint(payload.purpose, variant.purposeHint);
  }

  return next;
};

const courseSignature = (course: CourseResponse): string =>
  course.places
    .map((place) => place.id)
    .sort()
    .join("|");

const congestionPenalty: Record<CongestionLevel, number> = {
  low: 0,
  medium: 4,
  high: 12,
  unknown: 3
};

const scoreApiCourse = (course: CourseResponse, budget?: number): number => {
  const budgetPenalty =
    typeof budget === "number" && budget > 0 ? Math.max(0, course.totalCost - budget) / 1000 : 0;
  const durationPenalty = course.duration > 240 ? (course.duration - 240) / 8 : 0;
  const diversityBonus = Math.min(course.places.length, 4) * 3;

  return (
    100 + diversityBonus - budgetPenalty - durationPenalty - congestionPenalty[course.congestion]
  );
};

const toCourseResponseFromResult = (
  result: RecommendationResult,
  meta?: {
    recommendationRank?: number;
    recommendationType?: RecommendationType;
    isRecommended?: boolean;
  }
): CourseResponse | null => {
  if (!result.course) {
    return null;
  }

  return {
    id: result.requestId ? `crs_${result.requestId}` : "crs_preview",
    title: result.course.title,
    description: result.explanation?.summary ?? result.explanation?.reason,
    recommendationRank: meta?.recommendationRank,
    recommendationType: meta?.recommendationType,
    isRecommended: meta?.isRecommended,
    totalCost: result.course.estimatedBudget,
    duration: courseDuration(result.course.places),
    congestion: resolveCourseCongestion(result.context),
    weather: toWeatherResponse(result.context?.weather),
    places: result.course.places.map((place) => ({
      id: `plc_${place.placeId}`,
      name: place.title,
      lat: place.latitude ?? null,
      lng: place.longitude ?? null,
      order: place.order
    }))
  };
};

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
    const firstResult = await this.recommendCourse(
      buildVariantPayload(payload, recommendationVariants[0]),
      userId
    );
    const targetCourseCount = firstResult.candidateCount >= 30 ? 4 : 3;
    const results: Array<{ result: RecommendationResult; type: RecommendationType }> = [
      { result: firstResult, type: recommendationVariants[0].type }
    ];

    for (const variant of recommendationVariants.slice(1, targetCourseCount)) {
      const result = await this.recommendCourse(buildVariantPayload(payload, variant), userId);
      results.push({ result, type: variant.type });
    }

    const warnings = uniqueStringArray(results.flatMap(({ result }) => result.warnings));
    const seenSignatures = new Set<string>();
    const courses = results
      .map(({ result, type }) => toCourseResponseFromResult(result, { recommendationType: type }))
      .filter((course): course is CourseResponse => Boolean(course))
      .filter((course) => {
        const signature = courseSignature(course);
        if (!signature || seenSignatures.has(signature)) {
          return false;
        }
        seenSignatures.add(signature);
        return true;
      })
      .sort(
        (left, right) =>
          scoreApiCourse(right, payload.budget) - scoreApiCourse(left, payload.budget)
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
