import { db } from "../config/db";
import type {
  CreateUserProfileInput,
  UpdateUserPreferencesInput,
  UserProfile
} from "../models/user.model";

const mapUserProfile = (row: Record<string, unknown>): UserProfile => ({
  id: String(row.id),
  email: String(row.email),
  nickname: String(row.nickname),
  preferredRegion: (row.preferred_region as string | null) ?? null,
  preferredCategory: (row.preferred_category as string | null) ?? null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export const userRepository = {
  async getById(id: string): Promise<UserProfile | null> {
    const result = await db.query(
      `SELECT id, email, nickname, preferred_region, preferred_category, created_at, updated_at
         FROM profiles
        WHERE id = $1`,
      [id]
    );

    return result.rowCount ? mapUserProfile(result.rows[0]) : null;
  },

  async upsertProfile(input: CreateUserProfileInput): Promise<UserProfile> {
    const result = await db.query(
      `INSERT INTO profiles (id, email, nickname, preferred_region, preferred_category)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id)
       DO UPDATE SET
         email = EXCLUDED.email,
         nickname = EXCLUDED.nickname,
         preferred_region = EXCLUDED.preferred_region,
         preferred_category = EXCLUDED.preferred_category,
         updated_at = now()
       RETURNING id, email, nickname, preferred_region, preferred_category, created_at, updated_at`,
      [
        input.id,
        input.email,
        input.nickname,
        input.preferredRegion ?? null,
        input.preferredCategory ?? null
      ]
    );

    return mapUserProfile(result.rows[0]);
  },

  async updatePreferences(
    id: string,
    input: UpdateUserPreferencesInput
  ): Promise<UserProfile | null> {
    const result = await db.query(
      `UPDATE profiles
          SET preferred_region = COALESCE($2, preferred_region),
              preferred_category = COALESCE($3, preferred_category),
              updated_at = now()
        WHERE id = $1
        RETURNING id, email, nickname, preferred_region, preferred_category, created_at, updated_at`,
      [id, input.preferredRegion ?? null, input.preferredCategory ?? null]
    );

    return result.rowCount ? mapUserProfile(result.rows[0]) : null;
  }
};
