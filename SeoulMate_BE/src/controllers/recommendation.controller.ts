import { type NextFunction, type Response } from "express";

import { type AuthenticatedRequest } from "../middlewares/auth";
import { recommendationService } from "../services/recommendation.service";
import { ApiError } from "../utils/ApiError";

export const recommendCourse = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, "로그인이 필요합니다.");
    }

    res.status(200).json(await recommendationService.recommendCoursesForApi(req.body, req.user.id));
  } catch (error) {
    next(error);
  }
};

const parsePositiveInt = (value: unknown, fieldName: string): number => {
  const normalized = typeof value === "string" ? value.replace(/^crs_/, "") : value;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, `${fieldName} 값은 양의 정수여야 합니다.`);
  }

  return parsed;
};

export const getCourse = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, "로그인이 필요합니다.");
    }

    res
      .status(200)
      .json(
        await recommendationService.getCourseForApi(
          parsePositiveInt(req.params.courseId, "courseId"),
          req.user.id
        )
      );
  } catch (error) {
    next(error);
  }
};

export const listMyCourses = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, "로그인이 필요합니다.");
    }

    res.status(200).json(
      await recommendationService.listMyCoursesForApi(req.user.id, {
        page: Number(req.query.page) || 1,
        pageSize: Number(req.query.page_size ?? req.query.pageSize) || 10
      })
    );
  } catch (error) {
    next(error);
  }
};

export const listSavedCourses = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, "로그인이 필요합니다.");
    }

    res.status(200).json(
      await recommendationService.listSavedCoursesForApi(req.user.id, {
        page: Number(req.query.page) || 1,
        pageSize: Number(req.query.page_size ?? req.query.pageSize) || 10
      })
    );
  } catch (error) {
    next(error);
  }
};

export const saveCourse = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, "로그인이 필요합니다.");
    }

    const saved = await recommendationService.saveCourse(
      req.user.id,
      parsePositiveInt(req.params.courseId, "courseId"),
      typeof req.body.notes === "string" ? req.body.notes : null
    );

    res.status(201).json({
      savedAt: saved.saved?.savedAt ?? new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const removeSavedCourse = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new ApiError(401, "로그인이 필요합니다.");
    }

    await recommendationService.removeSavedCourse(
      req.user.id,
      parsePositiveInt(req.params.courseId, "courseId")
    );

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
