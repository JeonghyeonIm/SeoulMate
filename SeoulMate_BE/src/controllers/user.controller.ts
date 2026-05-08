import { type NextFunction, type Response } from "express";

import { type AuthenticatedRequest } from "../middlewares/auth";
import type { UserProfile } from "../models/user.model";
import { userService } from "../services/user.service";
import { ApiError } from "../utils/ApiError";

const parsePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const toUserResponse = (user: UserProfile) => ({
  id: String(user.id),
  email: user.email,
  nickname: user.nickname,
  vibes: user.vibes,
  budget: user.budget,
  role: user.role,
  createdAt: user.createdAt
});

const readStringArray = (value: unknown): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError(400, "vibes와 regions는 문자열 배열이어야 합니다.");
  }

  return value.map((item) => item.trim()).filter(Boolean);
};

const readPositiveBudget = (value: unknown): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, "budget 값은 양수여야 합니다.");
  }

  return Math.round(parsed);
};

export const getMe = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, "로그인이 필요합니다.");
    }

    const [user, savedCoursesCount] = await Promise.all([
      userService.getUser(req.user.id),
      userService.countSavedCourses(req.user.id)
    ]);

    res.status(200).json({
      ...toUserResponse(user),
      savedCoursesCount
    });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = parsePositiveInt(req.params.userId, 0);
    if (!userId) {
      throw new ApiError(400, "userId 값은 양의 정수여야 합니다.");
    }

    res.status(200).json(toUserResponse(await userService.getUser(userId)));
  } catch (error) {
    next(error);
  }
};

export const listUsers = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = Math.min(parsePositiveInt(req.query.page_size ?? req.query.pageSize, 20), 100);
    const [users, total] = await Promise.all([
      userService.listUsers({ page, pageSize }),
      userService.countUsers()
    ]);

    res.status(200).json({
      data: users.map(toUserResponse),
      total,
      page,
      page_size: pageSize
    });
  } catch (error) {
    next(error);
  }
};

export const updateMyPreferences = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, "로그인이 필요합니다.");
    }

    const vibes = readStringArray(req.body.vibes);
    const regions = readStringArray(req.body.regions);
    const budget = readPositiveBudget(req.body.budget);
    const preferredRegion =
      regions !== undefined
        ? regions.join(",") || null
        : typeof req.body.preferredRegion === "string"
          ? req.body.preferredRegion.trim() || null
          : undefined;

    if (vibes === undefined && preferredRegion === undefined && budget === undefined) {
      throw new ApiError(400, "vibes, regions, budget 중 하나 이상이 필요합니다.");
    }

    const updated = await userService.updatePreferences(req.user.id, {
      preferredRegion: preferredRegion ?? undefined,
      vibes,
      budget
    });

    res.status(200).json({
      vibes: updated.vibes,
      budget: updated.budget,
      updatedAt: updated.updatedAt
    });
  } catch (error) {
    next(error);
  }
};
