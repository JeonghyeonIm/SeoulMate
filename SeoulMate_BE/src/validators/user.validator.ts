import type { SignupPreferences, ValidatedSignupPayload, Vibe } from "../types/auth.types";
import { ApiError } from "../utils/ApiError";

export const ALLOWED_VIBES: Vibe[] = [
  "조용한",
  "힙한",
  "낭만적인",
  "로맨틱",
  "활기찬",
  "고즈넉한",
  "현대적인",
  "감성적인",
  "자연친화적"
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePreferences(value: unknown): SignupPreferences | null {
  if (value === undefined || value === null) return null;

  if (!isObject(value) || !("vibes" in value)) {
    throw new ApiError(400, "preferences.vibes는 null 또는 문자열 배열이어야 합니다.");
  }

  const { vibes } = value;
  if (vibes === null) return { vibes: null };

  if (!Array.isArray(vibes)) {
    throw new ApiError(400, "preferences.vibes는 null 또는 문자열 배열이어야 합니다.");
  }

  const invalid = vibes.find(
    (v: unknown) => typeof v !== "string" || !ALLOWED_VIBES.includes(v as Vibe)
  );
  if (invalid !== undefined) {
    throw new ApiError(400, "허용되지 않은 vibes 값이 포함되어 있습니다.");
  }

  return { vibes: vibes as Vibe[] };
}

export function validateSignupRequest(body: unknown): ValidatedSignupPayload {
  if (!isObject(body)) {
    throw new ApiError(400, "요청 본문은 객체여야 합니다.");
  }

  const { email, password, nickname, preferences } = body;

  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    throw new ApiError(400, "유효한 email 형식이 아닙니다.");
  }

  if (typeof nickname !== "string" || nickname.trim().length < 2 || nickname.trim().length > 10) {
    throw new ApiError(400, "nickname은 2자 이상 10자 이하여야 합니다.");
  }

  if (typeof password !== "string" || password.length < 8) {
    throw new ApiError(400, "password는 8자 이상이어야 합니다.");
  }

  return {
    email: email.trim().toLowerCase(),
    password,
    nickname: nickname.trim(),
    preferences: normalizePreferences(preferences)
  };
}
