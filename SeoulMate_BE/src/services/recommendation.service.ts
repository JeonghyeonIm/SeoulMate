import { runRecommendationGraph } from "../graphs/recommendation.graph";
import type {
  AiExplanation,
  CandidatePlace,
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

export interface CourseResponse {
  id: string;
  title: string;
  description?: string;
  totalCost: number;
  duration: number;
  congestion: "low" | "medium" | "high" | "unknown";
  weather?: RecommendationContextData["weather"];
  places: CoursePlaceResponse[];
}

export interface PagedCoursesResponse {
  data: CourseResponse[];
  total: number;
  page: number;
  page_size: number;
}

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

const normalizeStringArray = (value: unknown, fieldName: string, required = false): string[] => {
  if (value === undefined) {
    if (required) {
      throw new ApiError(400, `${fieldName} is required`);
    }
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError(400, `${fieldName} must be a string array`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
};

const buildStructuredRecommendationInput = (
  payload: RecommendCoursePayload
): { rawInput: string; parsedRequest?: ParsedRecommendationRequest } => {
  const legacyInput = typeof payload.input === "string" ? payload.input.trim() : "";

  if (legacyInput && !payload.region && !payload.budget && !payload.duration && !payload.vibes) {
    return { rawInput: legacyInput };
  }

  const region = typeof payload.region === "string" ? payload.region.trim() : "";
  const budget = Number(payload.budget);
  const durationHours = durationToHours(payload.duration);
  const vibes = normalizeStringArray(payload.vibes, "vibes", true);
  const dateTime = typeof payload.dateTime === "string" ? payload.dateTime.trim() : "";
  const purpose = typeof payload.purpose === "string" ? payload.purpose.trim() : undefined;
  const query = typeof payload.query === "string" ? payload.query.trim() : legacyInput;

  if (!region) {
    throw new ApiError(400, "region is required");
  }

  if (!Number.isFinite(budget) || budget <= 0) {
    throw new ApiError(400, "budget must be a positive number");
  }

  if (!durationHours) {
    throw new ApiError(400, "duration must be one of 2h, half-day, full-day");
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
    throw new ApiError(404, "Course not found");
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

const crowdToCongestion = (crowdLevel?: string): CourseResponse["congestion"] => {
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

const courseDuration = (places: RecommendationCoursePlace[]): number =>
  places.reduce((sum, place) => sum + place.estimatedTimeMinute + (place.moveTimeMinute ?? 0), 0);

const toCourseResponseFromResult = (result: RecommendationResult): CourseResponse | null => {
  if (!result.course) {
    return null;
  }

  return {
    id: result.requestId ? `crs_${result.requestId}` : "crs_preview",
    title: result.course.title,
    description: result.explanation?.summary ?? result.explanation?.reason,
    totalCost: result.course.estimatedBudget,
    duration: courseDuration(result.course.places),
    congestion: crowdToCongestion(result.context?.cityData?.crowdLevel),
    weather: result.context?.weather,
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

const toCourseResponseFromDetail = (detail: CourseDetail): CourseResponse => {
  const totalCost = detail.items.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0);
  const duration = detail.items.reduce(
    (sum, item) => sum + estimateStayDuration(item) + (item.travelMinutes ?? 0),
    0
  );
  const title = `${detail.request.preferredRegion ?? "서울"} ${
    detail.request.preferredCategory ?? "데이트"
  } 코스`;
  const description = detail.items.find((item) => item.reason)?.reason ?? "추천 코스입니다.";

  return {
    id: `crs_${detail.request.id}`,
    title,
    description,
    totalCost,
    duration,
    congestion: "unknown",
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
        status: "pending"
      });
      requestId = request.id;

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
      finalRecommendation: state.finalRecommendation,
      candidateCount: state.candidatePlaces?.length ?? 0,
      errors: state.errors ?? []
    };
  },

  async recommendCoursesForApi(
    payload: RecommendCoursePayload,
    userId: number
  ): Promise<{ courses: CourseResponse[] }> {
    const result = await this.recommendCourse(payload, userId);
    const course = toCourseResponseFromResult(result);
    return {
      courses: course ? [course] : []
    };
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
      throw new ApiError(409, "Course already saved");
    }

    const saved = await recommendationRepository.saveCourse(userId, request.id, notes);
    return buildCourseDetail(request, saved);
  },

  async removeSavedCourse(userId: number, courseId: number): Promise<{ removed: boolean }> {
    assertOwnRequest(await recommendationRepository.getRequestById(courseId), userId);
    const removed = await recommendationRepository.removeSavedCourse(userId, courseId);
    if (!removed) {
      throw new ApiError(404, "Saved course not found");
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
