export interface RecommendationRequest {
  id: string;
  userId: string;
  requestText: string | null;
  preferredRegion: string | null;
  preferredCategory: string | null;
  budget: number | null;
  companion: string | null;
  transportMode: string | null;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecommendationRequestInput {
  userId: string;
  requestText?: string | null;
  preferredRegion?: string | null;
  preferredCategory?: string | null;
  budget?: number | null;
  companion?: string | null;
  transportMode?: string | null;
  status?: "pending" | "completed" | "failed";
}

export interface RecommendationItem {
  id: number;
  requestId: string;
  userId: string;
  publicDataId: number;
  courseOrder: number | null;
  score: number;
  reason: string | null;
  travelMinutes: number | null;
  estimatedCost: number | null;
  createdAt: string;
}

export interface CreateRecommendationItemInput {
  requestId: string;
  userId: string;
  publicDataId: number;
  courseOrder?: number | null;
  score: number;
  reason?: string | null;
  travelMinutes?: number | null;
  estimatedCost?: number | null;
}

export interface SavedCourse {
  id: number;
  userId: string;
  requestId: string;
  notes: string | null;
  savedAt: string;
}
