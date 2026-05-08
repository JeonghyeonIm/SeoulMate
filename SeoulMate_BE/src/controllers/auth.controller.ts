import { type NextFunction, type Request, type Response } from "express";

import { env } from "../config/env";
import {
  getGoogleAuthUrl,
  getKakaoAuthUrl,
  handleGoogleCallback,
  handleKakaoCallback,
  login,
  refreshAuth,
  signup
} from "../services/auth.service";
import type { AuthResponseBody, LoginRequestBody, RefreshRequestBody } from "../types/auth.types";
import { ApiError } from "../utils/ApiError";
import { verifyToken } from "../utils/jwt";
import { validateSignupRequest } from "../validators/user.validator";

// ── 이메일 회원가입 ────────────────────────────────────────────────────────────

export async function signupController(
  req: Request,
  res: Response<AuthResponseBody>,
  next: NextFunction
): Promise<void> {
  try {
    const payload = validateSignupRequest(req.body);
    const result = await signup(payload);
    res.status(201).json(result);
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
    res.status(200).json(await login(email, password));
  } catch (error) {
    next(error);
  }
}

// ── 토큰 갱신 ─────────────────────────────────────────────────────────────────

export async function refreshController(
  req: Request<unknown, AuthResponseBody, RefreshRequestBody>,
  res: Response<AuthResponseBody>,
  next: NextFunction
): Promise<void> {
  try {
    if (typeof req.body.refreshToken !== "string") {
      throw new ApiError(400, "refreshToken이 필요합니다.");
    }
    res.status(200).json(await refreshAuth(req.body.refreshToken));
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
    if (typeof req.body.refreshToken !== "string") {
      throw new ApiError(400, "refreshToken이 필요합니다.");
    }
    verifyToken(req.body.refreshToken, "refresh");
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
      accessToken: result.accessToken,
      refreshToken: result.refreshToken
    });
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
      accessToken: result.accessToken,
      refreshToken: result.refreshToken
    });
    res.redirect(`${env.FRONTEND_URL}/auth/callback?${params}`);
  } catch (error) {
    next(error);
  }
}
