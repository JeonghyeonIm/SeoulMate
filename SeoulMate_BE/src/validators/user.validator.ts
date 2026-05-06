// src/validators/user.validator.ts
import {
  type AuthProvider,
  type SignupPreferences,
  type ValidatedSignupPayload,
  type Vibe
} from "../types/auth.types";
import { ApiError } from "../utils/ApiError";

const ALLOWED_PROVIDERS: AuthProvider[] = ["local", "kakao", "google"];

const ALLOWED_VIBES: Vibe[] = [
  "조용한",
  "힙한",
  "낭만적인",
  "활기찬",
  "고즈넉한",
  "현대적인",
  "감성적인",
  "자연친화적"
];

const EMAIL_REGEX: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePreferences(value: unknown): SignupPreferences | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isObject(value) || !("vibes" in value)) {
    throw new ApiError(400, "preferences.vibes는 null 또는 문자열 배열이어야 합니다.");
  }

  const { vibes } = value;

  if (vibes === null) {
    return { vibes: null };
  }

  if (!Array.isArray(vibes)) {
    throw new ApiError(400, "preferences.vibes는 null 또는 문자열 배열이어야 합니다.");
  }

  const invalidVibe: unknown = vibes.find((vibe: unknown): boolean => {
    return typeof vibe !== "string" || !ALLOWED_VIBES.includes(vibe as Vibe);
  });

  if (invalidVibe !== undefined) {
    throw new ApiError(400, "허용되지 않은 vibes 값이 포함되어 있습니다.");
  }

  return {
    vibes: vibes as Vibe[]
  };
}

export function validateSignupRequest(body: unknown): ValidatedSignupPayload {
  if (!isObject(body)) {
    throw new ApiError(400, "요청 본문은 객체여야 합니다.");
  }

  const { email, password, nickname, provider, preferences } = body;

  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    throw new ApiError(400, "유효한 email 형식이 아닙니다.");
  }

  if (typeof nickname !== "string" || nickname.trim().length < 2 || nickname.trim().length > 10) {
    throw new ApiError(400, "nickname은 2자 이상 10자 이하여야 합니다.");
  }

  if (typeof provider !== "string" || !ALLOWED_PROVIDERS.includes(provider as AuthProvider)) {
    throw new ApiError(400, "provider는 local, kakao, google 중 하나여야 합니다.");
  }

  if (provider === "local") {
    if (typeof password !== "string" || password.length < 8) {
      throw new ApiError(400, "local 회원가입은 8자 이상의 password가 필요합니다.");
    }
  }

  return {
    email: email.trim().toLowerCase(),
    password: provider === "local" && typeof password === "string" ? password : undefined,
    nickname: nickname.trim(),
    provider: provider as AuthProvider,
    preferences: normalizePreferences(preferences)
  };
}

export { ALLOWED_PROVIDERS, ALLOWED_VIBES };
