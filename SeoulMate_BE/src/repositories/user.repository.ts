import { db } from "../config/db";
import type {
  CreateUserProfileInput,
  UpdateUserPreferencesInput,
  UserProfile
} from "../models/user.model";

const mapUserProfile = (row: Record<string, unknown>): UserProfile => ({
  id: Number(row.id),
  email: String(row.email),
  nickname: String(row.nickname),
  preferredRegion: (row.preferred_region as string | null) ?? null,
  preferredCategory: (row.preferred_category as string | null) ?? null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export const userRepository = {
  async getById(id: number): Promise<UserProfile | null> {
    const result = await db.query(
      `SELECT id, email, nickname, preferred_region, preferred_category, created_at, updated_at
         FROM users
        WHERE id = $1`,
      [id]
    );

    return result.rowCount ? mapUserProfile(result.rows[0]) : null;
  },

  async getByEmail(email: string): Promise<UserProfile | null> {
    const result = await db.query(
      `SELECT id, email, nickname, preferred_region, preferred_category, created_at, updated_at
         FROM users
        WHERE email = $1`,
      [email]
    );

    return result.rowCount ? mapUserProfile(result.rows[0]) : null;
  },

  async createUser(input: CreateUserProfileInput): Promise<UserProfile> {
    const result = await db.query(
      `INSERT INTO users (email, password_hash, nickname, preferred_region, preferred_category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, nickname, preferred_region, preferred_category, created_at, updated_at`,
      [
        input.email,
        input.passwordHash,
        input.nickname,
        input.preferredRegion ?? null,
        input.preferredCategory ?? null
      ]
    );

    return mapUserProfile(result.rows[0]);
  },

  async updatePreferences(
    id: number,
    input: UpdateUserPreferencesInput
  ): Promise<UserProfile | null> {
    const result = await db.query(
      `UPDATE users
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
