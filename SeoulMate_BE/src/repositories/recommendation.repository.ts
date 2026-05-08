import { db } from "../config/db";
import type {
  CreateRecommendationItemInput,
  CreateRecommendationRequestInput,
  RecommendationItem,
  RecommendationRequest,
  SavedCourse
} from "../models/recommendation.model";

const mapRecommendationRequest = (row: Record<string, unknown>): RecommendationRequest => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  requestText: (row.request_text as string | null) ?? null,
  preferredRegion: (row.preferred_region as string | null) ?? null,
  preferredCategory: (row.preferred_category as string | null) ?? null,
  budget: row.budget === null ? null : Number(row.budget),
  companion: (row.companion as string | null) ?? null,
  transportMode: (row.transport_mode as string | null) ?? null,
  status: String(row.status) as RecommendationRequest["status"],
  courseTitle: (row.course_title as string | null) ?? null,
  courseDurationMinutes:
    row.course_duration_minutes === null ? null : Number(row.course_duration_minutes),
  courseCongestion: (row.course_congestion as string | null) ?? null,
  courseDescription: (row.course_description as string | null) ?? null,
  courseEstimatedBudget:
    row.course_estimated_budget === null ? null : Number(row.course_estimated_budget),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const mapRecommendationItem = (row: Record<string, unknown>): RecommendationItem => ({
  id: Number(row.id),
  requestId: Number(row.request_id),
  userId: Number(row.user_id),
  publicDataId: Number(row.public_data_id),
  courseOrder: row.course_order === null ? null : Number(row.course_order),
  score: Number(row.score),
  reason: (row.reason as string | null) ?? null,
  travelMinutes: row.travel_minutes === null ? null : Number(row.travel_minutes),
  estimatedCost: row.estimated_cost === null ? null : Number(row.estimated_cost),
  createdAt: String(row.created_at)
});

const mapSavedCourse = (row: Record<string, unknown>): SavedCourse => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  requestId: Number(row.request_id),
  notes: (row.notes as string | null) ?? null,
  savedAt: String(row.saved_at)
});

export const recommendationRepository = {
  async createRequest(input: CreateRecommendationRequestInput): Promise<RecommendationRequest> {
    const result = await db.query(
      `INSERT INTO recommendation_requests (
         user_id,
         request_text,
         preferred_region,
         preferred_category,
         budget,
         companion,
         transport_mode,
         status,
         course_title,
         course_duration_minutes,
         course_congestion,
         course_description,
         course_estimated_budget
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        input.userId,
        input.requestText ?? null,
        input.preferredRegion ?? null,
        input.preferredCategory ?? null,
        input.budget ?? null,
        input.companion ?? null,
        input.transportMode ?? null,
        input.status ?? "pending",
        input.courseTitle ?? null,
        input.courseDurationMinutes ?? null,
        input.courseCongestion ?? null,
        input.courseDescription ?? null,
        input.courseEstimatedBudget ?? null
      ]
    );

    return mapRecommendationRequest(result.rows[0]);
  },

  async updateRequestStatus(
    id: number,
    status: RecommendationRequest["status"]
  ): Promise<RecommendationRequest | null> {
    const result = await db.query(
      `UPDATE recommendation_requests
          SET status = $2,
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [id, status]
    );

    return result.rowCount ? mapRecommendationRequest(result.rows[0]) : null;
  },

  async getRequestById(id: number): Promise<RecommendationRequest | null> {
    const result = await db.query(`SELECT * FROM recommendation_requests WHERE id = $1`, [id]);
    return result.rowCount ? mapRecommendationRequest(result.rows[0]) : null;
  },

  async listRequestsByUser(
    userId: number,
    params: { page?: number; pageSize?: number }
  ): Promise<RecommendationRequest[]> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 20, 100));
    const result = await db.query(
      `SELECT *
         FROM recommendation_requests
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
       OFFSET $3`,
      [userId, pageSize, (page - 1) * pageSize]
    );

    return result.rows.map(mapRecommendationRequest);
  },

  async countRequestsByUser(userId: number): Promise<number> {
    const result = await db.query(
      `SELECT count(*)::int AS total
         FROM recommendation_requests
        WHERE user_id = $1`,
      [userId]
    );

    return Number(result.rows[0]?.total ?? 0);
  },

  async createItems(items: CreateRecommendationItemInput[]): Promise<RecommendationItem[]> {
    const createdItems: RecommendationItem[] = [];

    for (const item of items) {
      const result = await db.query(
        `INSERT INTO recommendations (
           request_id,
           user_id,
           public_data_id,
           course_order,
           score,
           reason,
           travel_minutes,
           estimated_cost
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (request_id, public_data_id)
         DO UPDATE SET
           course_order = EXCLUDED.course_order,
           score = EXCLUDED.score,
           reason = EXCLUDED.reason,
           travel_minutes = EXCLUDED.travel_minutes,
           estimated_cost = EXCLUDED.estimated_cost
         RETURNING *`,
        [
          item.requestId,
          item.userId,
          item.publicDataId,
          item.courseOrder ?? null,
          item.score,
          item.reason ?? null,
          item.travelMinutes ?? null,
          item.estimatedCost ?? null
        ]
      );

      createdItems.push(mapRecommendationItem(result.rows[0]));
    }

    return createdItems;
  },

  async listItemsByRequest(requestId: number): Promise<RecommendationItem[]> {
    const result = await db.query(
      `SELECT *
         FROM recommendations
        WHERE request_id = $1
        ORDER BY course_order ASC NULLS LAST, score DESC, id ASC`,
      [requestId]
    );

    return result.rows.map(mapRecommendationItem);
  },

  async saveCourse(userId: number, requestId: number, notes?: string | null): Promise<SavedCourse> {
    const result = await db.query(
      `INSERT INTO saved_courses (user_id, request_id, notes)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, request_id)
       DO UPDATE SET notes = EXCLUDED.notes
       RETURNING *`,
      [userId, requestId, notes ?? null]
    );

    return mapSavedCourse(result.rows[0]);
  },

  async getSavedCourse(userId: number, requestId: number): Promise<SavedCourse | null> {
    const result = await db.query(
      `SELECT *
         FROM saved_courses
        WHERE user_id = $1
          AND request_id = $2`,
      [userId, requestId]
    );

    return result.rowCount ? mapSavedCourse(result.rows[0]) : null;
  },

  async removeSavedCourse(userId: number, requestId: number): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM saved_courses
        WHERE user_id = $1
          AND request_id = $2`,
      [userId, requestId]
    );

    return (result.rowCount ?? 0) > 0;
  },

  async listSavedCourses(
    userId: number,
    params: { page?: number; pageSize?: number } = {}
  ): Promise<SavedCourse[]> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 10, 50));
    const result = await db.query(
      `SELECT *
         FROM saved_courses
        WHERE user_id = $1
        ORDER BY saved_at DESC
        LIMIT $2
       OFFSET $3`,
      [userId, pageSize, (page - 1) * pageSize]
    );

    return result.rows.map(mapSavedCourse);
  },

  async countSavedCourses(userId: number): Promise<number> {
    const result = await db.query(
      `SELECT count(*)::int AS total
         FROM saved_courses
        WHERE user_id = $1`,
      [userId]
    );

    return Number(result.rows[0]?.total ?? 0);
  }
};
