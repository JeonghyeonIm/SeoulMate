import { Annotation } from "@langchain/langgraph";

export interface ParsedRecommendationRequest {
  region?: string;
  budget?: number;
  dateTime?: string;
  durationHours?: number;
  mood?: string[];
  purpose?: string;
  preferredCategories?: string[];
}

export interface CandidatePlace {
  id: number;
  title: string;
  category: string;
  placeFamily?: string;
  placeType?: string;
  placeSubtype?: string;
  kakaoCategoryName?: string;
  kakaoCategoryGroupName?: string;
  region?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  estimatedCost?: number;
  tags?: string[];
  sourceDataset?: string;
  source?: string;
  sourceUrl?: string;
  mapUrl?: string;
  metadata?: Record<string, unknown>;
  mapVerification?: {
    provider: "kakaoLocal";
    verified: boolean;
    placeId?: string;
    placeName?: string;
    placeUrl?: string;
    categoryName?: string;
    phone?: string;
    confidence?: number;
    distanceMeter?: number;
  };
}

export interface PlaceDistanceContext {
  distanceMeter: number;
  durationMinute: number;
  provider?: "kakaoWalking" | "estimated";
  isFallback?: boolean;
}

export type WeatherSource =
  | "cityData"
  | "ultraShortTerm"
  | "shortTerm"
  | "mediumTerm"
  | "unavailable";

export type CongestionLevel = "low" | "medium" | "high" | "unknown";

export interface RecommendationContextData {
  referenceCoordinate?: {
    latitude: number;
    longitude: number;
    source: "regionCentroid" | "candidateCentroid" | "singleCandidate" | "fallback";
  };
  cityData?: {
    areaName: string;
    crowdLevel?: string;
    weatherStatus?: string;
    skyStatus?: string;
    temperature?: number;
    rainProbability?: number;
    weatherAlert?: string;
    trafficStatus?: string;
  };
  weather?: {
    source: WeatherSource;
    targetDateTime?: string;
    rainProbability?: number;
    skyStatus?: string;
    temperature?: number;
    weatherAlert?: string;
  };
  route?: {
    totalDistanceMeter?: number;
    totalDurationMinute?: number;
    provider?: "kakaoWalking" | "estimated";
    isFallback?: boolean;
  };
  placeDistances?: Record<number, PlaceDistanceContext>;
  livingPopulation?: {
    source: "livingPopulation";
    guCode: string;
    districtName: string;
    dayOfWeek: number;
    hourCode: number;
    avgPopulation?: number;
    congestion: CongestionLevel;
  };
}

export interface ScoredRecommendationPlace {
  placeId: number;
  totalScore: number;
  scoreDetail: Record<string, number>;
}

export interface RecommendationCoursePlace {
  order: number;
  placeId: number;
  title: string;
  category: string;
  estimatedTimeMinute: number;
  moveTimeMinute?: number;
  moveDistanceMeter?: number;
  routeProvider?: "kakaoWalking" | "estimated";
  routeFallback?: boolean;
  estimatedCost?: number;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface RecommendationCourse {
  title: string;
  places: RecommendationCoursePlace[];
  totalScore: number;
  estimatedBudget: number;
}

export interface AiExplanation {
  summary: string;
  reason: string;
  riskNotice?: string;
  alternativeSuggestion?: string;
}

export interface RecommendationValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FinalRecommendationResult {
  request: {
    rawInput: string;
    parsed?: ParsedRecommendationRequest;
  };
  course?: RecommendationCourse;
  explanation?: AiExplanation;
  context?: RecommendationContextData;
  validation?: RecommendationValidation;
  riskNotices: string[];
  warnings: string[];
  candidateCount: number;
}

export const RecommendationStateAnnotation = Annotation.Root({
  rawInput: Annotation<string>(),
  parsedRequest: Annotation<ParsedRecommendationRequest | undefined>(),
  candidatePlaces: Annotation<CandidatePlace[] | undefined>(),
  contextData: Annotation<RecommendationContextData | undefined>(),
  scoredPlaces: Annotation<ScoredRecommendationPlace[] | undefined>(),
  course: Annotation<RecommendationCourse | undefined>(),
  aiExplanation: Annotation<AiExplanation | undefined>(),
  validation: Annotation<RecommendationValidation | undefined>(),
  riskNotices: Annotation<string[] | undefined>(),
  finalRecommendation: Annotation<FinalRecommendationResult | undefined>(),
  warnings: Annotation<string[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => []
  }),
  errors: Annotation<string[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => []
  })
});

export type SeoulMateGraphState = typeof RecommendationStateAnnotation.State;
export type SeoulMateGraphUpdate = typeof RecommendationStateAnnotation.Update;
