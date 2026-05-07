// src/controllers/auth.controller.ts
import { type NextFunction, type Request, type Response } from "express";

import { login, refreshAuth, signup } from "../services/auth.service";
import {
  type LoginRequestBody,
  type RefreshRequestBody,
  type SignupRequestBody,
  type SignupResponseBody
} from "../types/auth.types";
import { ApiError } from "../utils/ApiError";
import { verifyToken } from "../utils/jwt";
import { validateSignupRequest } from "../validators/user.validator";

export async function signupController(
  req: Request<unknown, SignupResponseBody, SignupRequestBody>,
  res: Response<SignupResponseBody>,
  next: NextFunction
): Promise<void> {
  try {
    const validatedPayload = validateSignupRequest(req.body);
    const signupResult: SignupResponseBody = await signup(validatedPayload);

    res.status(201).json(signupResult);
  } catch (error: unknown) {
    next(error);
  }
}

export async function loginController(
  req: Request<unknown, Record<string, unknown>, LoginRequestBody>,
  res: Response<Record<string, unknown>>,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string") {
      throw new ApiError(400, "email and password are required");
    }

    const { accessToken, refreshToken, user } = await login(email, password);
    res.status(200).json({
      accessToken,
      refreshToken,
      user
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshController(
  req: Request<unknown, { accessToken: string }, RefreshRequestBody>,
  res: Response<{ accessToken: string }>,
  next: NextFunction
): Promise<void> {
  try {
    if (typeof req.body.refreshToken !== "string") {
      throw new ApiError(400, "refreshToken is required");
    }

    const { accessToken } = await refreshAuth(req.body.refreshToken);
    res.status(200).json({ accessToken });
  } catch (error) {
    next(error);
  }
}

export async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (typeof req.body.refreshToken !== "string") {
      throw new ApiError(401, "refreshToken is required");
    }

    verifyToken(req.body.refreshToken, "refresh");
    res.status(204).send();
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, "Invalid refresh token"));
  }
}
