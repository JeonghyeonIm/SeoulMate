import { db } from "../config/db";
import type {
  CreateUserProfileInput,
  ListUsersParams,
  UpdateUserPreferencesInput,
  UserAuthRecord,
  UserProfile
} from "../models/user.model";

const COMMON_COLUMNS = `
  id, email, nickname, vibes, budget, role, provider, oauth_id,
  preferred_region, created_at, updated_at
`;

const mapUserProfile = (row: Record<string, unknown>): UserProfile => ({
  id: Number(row.id),
  email: String(row.email),
  nickname: String(row.nickname),
  vibes: Array.isArray(row.vibes) ? (row.vibes as string[]) : [],
  budget: row.budget === null || row.budget === undefined ? null : Number(row.budget),
  role: String(row.role ?? "user"),
  provider: String(row.provider ?? "local"),
  oauthId: (row.oauth_id as string | null) ?? null,
  preferredRegion: (row.preferred_region as string | null) ?? null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const mapUserAuthRecord = (row: Record<string, unknown>): UserAuthRecord => ({
  ...mapUserProfile(row),
  passwordHash: row.password_hash ? String(row.password_hash) : null
});

export const userRepository = {
  async getById(id: number): Promise<UserProfile | null> {
    const result = await db.query(`SELECT ${COMMON_COLUMNS} FROM users WHERE id = $1`, [id]);
    return result.rowCount ? mapUserProfile(result.rows[0]) : null;
  },

  async getByEmail(email: string): Promise<UserProfile | null> {
    const result = await db.query(`SELECT ${COMMON_COLUMNS} FROM users WHERE email = $1`, [email]);
    return result.rowCount ? mapUserProfile(result.rows[0]) : null;
  },

  async getAuthByEmail(email: string): Promise<UserAuthRecord | null> {
    const result = await db.query(
      `SELECT ${COMMON_COLUMNS}, password_hash FROM users WHERE email = $1`,
      [email]
    );
    return result.rowCount ? mapUserAuthRecord(result.rows[0]) : null;
  },

  async getByNickname(nickname: string): Promise<UserProfile | null> {
    const result = await db.query(`SELECT ${COMMON_COLUMNS} FROM users WHERE nickname = $1`, [
      nickname
    ]);
    return result.rowCount ? mapUserProfile(result.rows[0]) : null;
  },

  async findByOAuth(provider: string, oauthId: string): Promise<UserProfile | null> {
    const result = await db.query(
      `SELECT ${COMMON_COLUMNS} FROM users WHERE provider = $1 AND oauth_id = $2`,
      [provider, oauthId]
    );
    return result.rowCount ? mapUserProfile(result.rows[0]) : null;
  },

  async findAvailableNickname(base: string): Promise<string> {
    const safe = base.replace(/[^가-힣a-zA-Z0-9_]/g, "").slice(0, 8) || "사용자";

    const existing = await this.getByNickname(safe);
    if (!existing) return safe;

    for (let i = 0; i < 10; i++) {
      const suffix = Math.random().toString(36).slice(2, 6);
      const candidate = `${safe}_${suffix}`.slice(0, 10);
      if (!(await this.getByNickname(candidate))) return candidate;
    }

    return `user_${Date.now().toString(36).slice(-6)}`;
  },

  async createUser(input: CreateUserProfileInput): Promise<UserProfile> {
    const result = await db.query(
      `INSERT INTO users (email, password_hash, nickname, vibes, budget, preferred_region, provider, oauth_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COMMON_COLUMNS}`,
      [
        input.email,
        input.passwordHash ?? null,
        input.nickname,
        input.vibes ?? [],
        input.budget ?? null,
        input.preferredRegion ?? null,
        input.provider ?? "local",
        input.oauthId ?? null
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
              vibes             = CASE WHEN $3::text[] IS NOT NULL THEN $3 ELSE vibes END,
              budget            = CASE WHEN $4 IS NOT NULL THEN $4 ELSE budget END,
              updated_at        = now()
        WHERE id = $1
        RETURNING ${COMMON_COLUMNS}`,
      [
        id,
        input.preferredRegion ?? null,
        input.vibes !== undefined ? input.vibes : null,
        input.budget !== undefined ? input.budget : null
      ]
    );
    return result.rowCount ? mapUserProfile(result.rows[0]) : null;
  },

  async listUsers(params: ListUsersParams): Promise<UserProfile[]> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 20, 100));
    const result = await db.query(
      `SELECT ${COMMON_COLUMNS}
         FROM users
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2`,
      [pageSize, (page - 1) * pageSize]
    );
    return result.rows.map(mapUserProfile);
  },

  async countUsers(): Promise<number> {
    const result = await db.query(`SELECT count(*)::int AS total FROM users`);
    return Number(result.rows[0]?.total ?? 0);
  }
};
