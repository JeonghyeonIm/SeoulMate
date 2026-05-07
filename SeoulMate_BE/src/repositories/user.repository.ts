import { db } from "../config/db";
import type {
  CreateUserProfileInput,
  ListUsersParams,
  UpdateUserPreferencesInput,
  UserAuthRecord,
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

const mapUserAuthRecord = (row: Record<string, unknown>): UserAuthRecord => ({
  ...mapUserProfile(row),
  passwordHash: String(row.password_hash)
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

  async getAuthByEmail(email: string): Promise<UserAuthRecord | null> {
    const result = await db.query(
      `SELECT id, email, password_hash, nickname, preferred_region, preferred_category, created_at, updated_at
         FROM users
        WHERE email = $1`,
      [email]
    );

    return result.rowCount ? mapUserAuthRecord(result.rows[0]) : null;
  },

  async getByNickname(nickname: string): Promise<UserProfile | null> {
    const result = await db.query(
      `SELECT id, email, nickname, preferred_region, preferred_category, created_at, updated_at
         FROM users
        WHERE nickname = $1`,
      [nickname]
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
  },

  async listUsers(params: ListUsersParams): Promise<UserProfile[]> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 20, 100));
    const result = await db.query(
      `SELECT id, email, nickname, preferred_region, preferred_category, created_at, updated_at
         FROM users
        ORDER BY created_at DESC, id DESC
        LIMIT $1
       OFFSET $2`,
      [pageSize, (page - 1) * pageSize]
    );

    return result.rows.map(mapUserProfile);
  },

  async countUsers(): Promise<number> {
    const result = await db.query(`SELECT count(*)::int AS total FROM users`);
    return Number(result.rows[0]?.total ?? 0);
  }
};
