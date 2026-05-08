import bcrypt from "bcrypt";

import { googleOAuthClient } from "../clients/google.oauth.client";
import { kakaoOAuthClient } from "../clients/kakao.oauth.client";
import type { UserProfile } from "../models/user.model";
import { userRepository } from "../repositories/user.repository";
import type { AuthResponseBody, ValidatedSignupPayload } from "../types/auth.types";
import { ApiError } from "../utils/ApiError";
import { issueAuthTokens, verifyToken } from "../utils/jwt";

const SALT_ROUNDS = 10;

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────────────

function buildAuthResponse(user: UserProfile): AuthResponseBody {
  return {
    user: { id: user.id, email: user.email, nickname: user.nickname },
    ...issueAuthTokens(user.id)
  };
}

async function ensureEmailAvailable(email: string): Promise<void> {
  if (await userRepository.getByEmail(email)) {
    throw new ApiError(409, "이미 사용 중인 이메일입니다.");
  }
}

async function ensureNicknameAvailable(nickname: string): Promise<void> {
  if (await userRepository.getByNickname(nickname)) {
    throw new ApiError(409, "이미 사용 중인 닉네임입니다.");
  }
}

// ── OAuth 공통 로직 ───────────────────────────────────────────────────────────

async function loginWithOAuth(
  provider: "kakao" | "google",
  oauthId: string,
  email: string,
  displayName: string
): Promise<AuthResponseBody> {
  // 1. (provider, oauth_id)로 기존 유저 조회
  const existing = await userRepository.findByOAuth(provider, oauthId);
  if (existing) return buildAuthResponse(existing);

  // 2. 이메일이 다른 provider로 이미 가입됐는지 확인
  const byEmail = await userRepository.getByEmail(email);
  if (byEmail) {
    if (byEmail.provider !== provider) {
      throw new ApiError(
        409,
        `이미 ${byEmail.provider === "local" ? "이메일" : byEmail.provider}(으)로 가입된 계정입니다.`
      );
    }
    // 동일 provider지만 oauth_id 없는 레코드 → 이론상 발생하지 않음
    throw new ApiError(409, "이미 가입된 이메일입니다.");
  }

  // 3. 자동 회원가입
  const nickname = await userRepository.findAvailableNickname(displayName);
  const user = await userRepository.createUser({
    email,
    passwordHash: null,
    nickname,
    provider,
    oauthId,
    vibes: []
  });

  return buildAuthResponse(user);
}

// ── 이메일(local) 회원가입 ─────────────────────────────────────────────────────

export async function signup(payload: ValidatedSignupPayload): Promise<AuthResponseBody> {
  await ensureEmailAvailable(payload.email);
  await ensureNicknameAvailable(payload.nickname);

  const passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);
  const user = await userRepository.createUser({
    email: payload.email,
    passwordHash,
    nickname: payload.nickname,
    provider: "local",
    vibes: payload.preferences?.vibes ?? []
  });

  return buildAuthResponse(user);
}

// ── 이메일(local) 로그인 ───────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthResponseBody> {
  const user = await userRepository.getAuthByEmail(email.trim().toLowerCase());

  if (!user || user.provider !== "local" || !user.passwordHash) {
    throw new ApiError(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new ApiError(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  }

  return buildAuthResponse(user);
}

// ── 카카오 OAuth ──────────────────────────────────────────────────────────────

export function getKakaoAuthUrl(): string {
  return kakaoOAuthClient.getAuthorizationUrl();
}

export async function handleKakaoCallback(code: string): Promise<AuthResponseBody> {
  try {
    const accessToken = await kakaoOAuthClient.getAccessToken(code);
    const userInfo = await kakaoOAuthClient.getUserInfo(accessToken);

    const email = userInfo.kakao_account?.email;
    if (!email) {
      throw new ApiError(
        400,
        "카카오 계정에서 이메일을 가져올 수 없습니다. 이메일 제공에 동의해주세요."
      );
    }

    const nickname = userInfo.kakao_account?.profile?.nickname ?? "카카오사용자";
    return loginWithOAuth("kakao", String(userInfo.id), email, nickname);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "카카오 로그인 처리 중 오류가 발생했습니다.");
  }
}

// ── 구글 OAuth ────────────────────────────────────────────────────────────────

export function getGoogleAuthUrl(): string {
  return googleOAuthClient.getAuthorizationUrl();
}

export async function handleGoogleCallback(code: string): Promise<AuthResponseBody> {
  try {
    const accessToken = await googleOAuthClient.getAccessToken(code);
    const userInfo = await googleOAuthClient.getUserInfo(accessToken);

    const nickname = userInfo.given_name ?? userInfo.name ?? "구글사용자";
    return loginWithOAuth("google", userInfo.id, userInfo.email, nickname);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "구글 로그인 처리 중 오류가 발생했습니다.");
  }
}

// ── 토큰 갱신 ─────────────────────────────────────────────────────────────────

export async function refreshAuth(refreshToken: string): Promise<AuthResponseBody> {
  try {
    const payload = verifyToken(refreshToken, "refresh");
    const user = await userRepository.getById(Number(payload.sub));
    if (!user) throw new ApiError(401, "존재하지 않는 사용자입니다.");
    return buildAuthResponse(user);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "유효하지 않은 refresh token입니다.");
  }
}
