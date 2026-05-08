// src/services/auth.service.ts
import bcrypt from "bcrypt";

import type { UserProfile } from "../models/user.model";
import { userRepository } from "../repositories/user.repository";
import {
  type AuthResponseBody,
  type SignupResponseBody,
  type ValidatedSignupPayload
} from "../types/auth.types";
import { ApiError } from "../utils/ApiError";
import { issueAuthTokens, verifyToken } from "../utils/jwt";

const SALT_ROUNDS: number = 10;

async function ensureEmailAvailable(email: string): Promise<void> {
  const existingUser: UserProfile | null = await userRepository.getByEmail(email);

  if (existingUser !== null) {
    throw new ApiError(409, "이미 사용 중인 이메일입니다.");
  }
}

async function ensureNicknameAvailable(nickname: string): Promise<void> {
  const existingUser: UserProfile | null = await userRepository.getByNickname(nickname);

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
  const user = await userRepository.createUser({
    email: payload.email,
    passwordHash: passwordHash ?? `${payload.provider}:oauth`,
    nickname: payload.nickname,
    vibes: payload.preferences?.vibes ?? []
  });

  return {
    id: String(user.id),
    email: user.email,
    nickname: user.nickname,
    createdAt: user.createdAt
  };
}

export async function login(email: string, password: string): Promise<AuthResponseBody> {
  const user = await userRepository.getAuthByEmail(email.trim().toLowerCase());

  if (!user || !user.passwordHash.startsWith("$2")) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw new ApiError(401, "Invalid email or password");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname
    },
    ...issueAuthTokens(user.id)
  };
}

export async function refreshAuth(refreshToken: string): Promise<AuthResponseBody> {
  try {
    const payload = verifyToken(refreshToken, "refresh");
    const user = await userRepository.getById(Number(payload.sub));

    if (!user) {
      throw new ApiError(401, "User not found");
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname
      },
      ...issueAuthTokens(user.id)
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(401, "Invalid refresh token");
  }
}
