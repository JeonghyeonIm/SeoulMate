// src/services/auth.service.ts
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

import { save as savePreference } from "../repositories/preference.repository";
import { findByEmail, findByNickname, save as saveUser } from "../repositories/user.repository";
import {
  type SignupResponseBody,
  type UserRecord,
  type ValidatedSignupPayload
} from "../types/auth.types";
import { ApiError } from "../utils/ApiError";

const SALT_ROUNDS: number = 10;

async function ensureEmailAvailable(email: string): Promise<void> {
  const existingUser: UserRecord | null = await findByEmail(email);

  if (existingUser !== null) {
    throw new ApiError(409, "이미 사용 중인 이메일입니다.");
  }
}

async function ensureNicknameAvailable(nickname: string): Promise<void> {
  const existingUser: UserRecord | null = await findByNickname(nickname);

  if (existingUser !== null) {
    throw new ApiError(409, "이미 사용 중인 닉네임입니다.");
  }
}

async function buildPassword(
  provider: "local" | "kakao" | "google",
  password?: string
): Promise<string | null> {
  if (provider !== "local") {
    return null;
  }

  if (typeof password !== "string") {
    throw new ApiError(400, "local 회원가입은 password가 필요합니다.");
  }

  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function signup(payload: ValidatedSignupPayload): Promise<SignupResponseBody> {
  await ensureEmailAvailable(payload.email);
  await ensureNicknameAvailable(payload.nickname);

  const passwordHash: string | null = await buildPassword(payload.provider, payload.password);
  const userId: string = uuidv4();
  const createdAt: string = new Date().toISOString();

  await saveUser({
    id: userId,
    email: payload.email,
    password: passwordHash,
    nickname: payload.nickname,
    provider: payload.provider,
    createdAt
  });

  if (payload.preferences?.vibes !== null && payload.preferences !== null) {
    await savePreference({
      userId,
      vibes: payload.preferences.vibes
    });
  }

  return {
    id: userId,
    email: payload.email,
    nickname: payload.nickname,
    createdAt
  };
}
