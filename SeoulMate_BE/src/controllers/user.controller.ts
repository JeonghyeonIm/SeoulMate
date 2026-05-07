import { type NextFunction, type Response } from "express";

import { type AuthenticatedRequest } from "../middlewares/auth";
import type { UserProfile } from "../models/user.model";
import { userService } from "../services/user.service";
import { ApiError } from "../utils/ApiError";

const parsePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const splitCsv = (value: string | null): string[] =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const toUserResponse = (user: UserProfile) => ({
  id: String(user.id),
  email: user.email,
  nickname: user.nickname,
  vibes: splitCsv(user.preferredCategory),
  createdAt: user.createdAt
});

const readStringArray = (value: unknown): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError(400, "vibes and regions must be string arrays");
  }

  return value.map((item) => item.trim()).filter(Boolean);
};

export const getMe = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
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
      throw new ApiError(400, "userId must be a positive integer");
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
    const pageSize = Math.min(
      parsePositiveInt(req.query.page_size ?? req.query.pageSize, 20),
      100
    );
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
      throw new ApiError(401, "Authentication required");
    }

    const vibes = readStringArray(req.body.vibes);
    const regions = readStringArray(req.body.regions);
    const preferredRegion =
      regions?.join(",") ??
      (typeof req.body.preferredRegion === "string" ? req.body.preferredRegion.trim() : undefined);
    const preferredCategory =
      vibes?.join(",") ??
      (typeof req.body.preferredCategory === "string"
        ? req.body.preferredCategory.trim()
        : undefined);

    if (!preferredRegion && !preferredCategory && req.body.budget === undefined) {
      throw new ApiError(400, "vibes, regions, or budget is required");
    }

    const updated = await userService.updatePreferences(req.user.id, {
      preferredRegion: preferredRegion || undefined,
      preferredCategory: preferredCategory || undefined
    });

    res.status(200).json({
      vibes: splitCsv(updated.preferredCategory),
      updatedAt: updated.updatedAt
    });
  } catch (error) {
    next(error);
  }
};
