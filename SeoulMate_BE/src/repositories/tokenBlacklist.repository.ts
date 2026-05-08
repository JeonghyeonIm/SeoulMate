import { db } from "../config/db";

export const tokenBlacklistRepository = {
  async add(tokenHash: string, userId: number, expiresAt: Date): Promise<void> {
    await db.query(
      `INSERT INTO refresh_token_blacklist (token_hash, user_id, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (token_hash) DO NOTHING`,
      [tokenHash, userId, expiresAt]
    );
  },

  async isBlacklisted(tokenHash: string): Promise<boolean> {
    const result = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM refresh_token_blacklist
         WHERE token_hash = $1 AND expires_at > now()
       ) AS exists`,
      [tokenHash]
    );
    return result.rows[0]?.exists ?? false;
  },

  async deleteExpired(): Promise<number> {
    const result = await db.query(`DELETE FROM refresh_token_blacklist WHERE expires_at <= now()`);
    return result.rowCount ?? 0;
  }
};
