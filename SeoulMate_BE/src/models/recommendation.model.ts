export interface RecommendationRequest {
  id: number;
  userId: number;
  requestText: string | null;
  preferredRegion: string | null;
  preferredCategory: string | null;
  budget: number | null;
  companion: string | null;
  transportMode: string | null;
  status: "pending" | "completed" | "failed";
  courseTitle: string | null;
  courseDurationMinutes: number | null;
  courseCongestion: string | null;
  courseDescription: string | null;
  courseEstimatedBudget: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecommendationRequestInput {
  userId: number;
  requestText?: string | null;
  preferredRegion?: string | null;
  preferredCategory?: string | null;
  budget?: number | null;
  companion?: string | null;
  transportMode?: string | null;
  status?: "pending" | "completed" | "failed";
  courseTitle?: string | null;
  courseDurationMinutes?: number | null;
  courseCongestion?: string | null;
  courseDescription?: string | null;
  courseEstimatedBudget?: number | null;
}

export interface RecommendationItem {
  id: number;
  requestId: number;
  userId: number;
  publicDataId: number;
  courseOrder: number | null;
  score: number;
  reason: string | null;
  travelMinutes: number | null;
  estimatedCost: number | null;
  createdAt: string;
}

export interface CreateRecommendationItemInput {
  requestId: number;
  userId: number;
  publicDataId: number;
  courseOrder?: number | null;
  score: number;
  reason?: string | null;
  travelMinutes?: number | null;
  estimatedCost?: number | null;
}

export interface SavedCourse {
  id: number;
  userId: number;
  requestId: number;
  notes: string | null;
  savedAt: string;
}
