import { type CookieOptions, type NextFunction, type Request, type Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";

import { env } from "../config/env";
import {
  getGoogleAuthUrl,
  getKakaoAuthUrl,
  handleGoogleCallback,
  handleKakaoCallback,
  login,
  logout,
  refreshAuth,
  signup
} from "../services/auth.service";
import type { AuthResponseBody, LoginRequestBody, RefreshRequestBody } from "../types/auth.types";
import { ApiError } from "../utils/ApiError";
import { validateSignupRequest } from "../validators/user.validator";

const REFRESH_TOKEN_COOKIE_NAME = "seoulmate-refresh-token";

const getRefreshTokenCookieOptions = (maxAge: number): CookieOptions => {
  const secure = process.env.COOKIE_SECURE === "true";

  return {
    httpOnly: true,
    secure,
    sameSite: "strict",
    ...(secure ? { domain: ".seoulmate.my" } : {}),
    path: "/api/auth",
    maxAge
  };
};

const setRefreshTokenCookie = (res: Response, refreshToken: string, maxAge = 604800000): void => {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, getRefreshTokenCookieOptions(maxAge));
};

const getRefreshTokenFromCookie = (req: Request): string => {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    throw new ApiError(401, "refresh token 쿠키가 필요합니다.");
  }

  return refreshToken;
};

// ── 이메일 회원가입 ────────────────────────────────────────────────────────────

export async function signupController(
  req: Request,
  res: Response<AuthResponseBody>,
  next: NextFunction
): Promise<void> {
  try {
    const payload = validateSignupRequest(req.body);
    const result = await signup(payload);
    setRefreshTokenCookie(res, result.refreshToken);
    res.status(201).json(result.body);
  } catch (error) {
    next(error);
  }
}

// ── 이메일 로그인 ──────────────────────────────────────────────────────────────

export async function loginController(
  req: Request<unknown, AuthResponseBody, LoginRequestBody>,
  res: Response<AuthResponseBody>,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string") {
      throw new ApiError(400, "email과 password가 필요합니다.");
    }
    const result = await login(email, password);
    setRefreshTokenCookie(res, result.refreshToken);
    res.status(200).json(result.body);
  } catch (error) {
    next(error);
  }
}

// ── 토큰 갱신 ─────────────────────────────────────────────────────────────────

export async function refreshController(
  req: Request<ParamsDictionary, AuthResponseBody, RefreshRequestBody>,
  res: Response<AuthResponseBody>,
  next: NextFunction
): Promise<void> {
  try {
    const result = await refreshAuth(getRefreshTokenFromCookie(req));
    setRefreshTokenCookie(res, result.refreshToken);
    res.status(200).json(result.body);
  } catch (error) {
    next(error);
  }
}

// ── 로그아웃 ──────────────────────────────────────────────────────────────────

export async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await logout(getRefreshTokenFromCookie(req));
    setRefreshTokenCookie(res, "", 0);
    res.status(204).send();
  } catch (error) {
    next(
      error instanceof ApiError ? error : new ApiError(401, "유효하지 않은 refresh token입니다.")
    );
  }
}

// ── 카카오 OAuth ──────────────────────────────────────────────────────────────

export function kakaoAuthController(_req: Request, res: Response): void {
  res.redirect(getKakaoAuthUrl());
}

export async function kakaoCallbackController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const code = req.query.code;
    if (typeof code !== "string") {
      throw new ApiError(400, "인가 코드가 없습니다.");
    }

    const result = await handleKakaoCallback(code);
    const params = new URLSearchParams({
      accessToken: result.body.accessToken
    });
    setRefreshTokenCookie(res, result.refreshToken);
    res.redirect(`${env.FRONTEND_URL}/auth/callback?${params}`);
  } catch (error) {
    next(error);
  }
}

// ── 구글 OAuth ────────────────────────────────────────────────────────────────

export function googleAuthController(_req: Request, res: Response): void {
  res.redirect(getGoogleAuthUrl());
}

export async function googleCallbackController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const code = req.query.code;
    if (typeof code !== "string") {
      throw new ApiError(400, "인가 코드가 없습니다.");
    }

    const result = await handleGoogleCallback(code);
    const params = new URLSearchParams({
      accessToken: result.body.accessToken
    });
    setRefreshTokenCookie(res, result.refreshToken);
    res.redirect(`${env.FRONTEND_URL}/auth/callback?${params}`);
  } catch (error) {
    next(error);
  }
}
