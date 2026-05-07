import { type NextFunction, type Request, type Response } from "express";

import { placeService } from "../services/place.service";
import { ApiError } from "../utils/ApiError";

const parsePositiveInt = (value: unknown, fallback: number): number => {
  const normalized = typeof value === "string" ? value.replace(/^plc_/, "") : value;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const readQueryString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const searchPlaces = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(200).json({
      ...(await placeService.searchPlaces({
        q: readQueryString(req.query.q),
        region: readQueryString(req.query.region),
        category: readQueryString(req.query.category),
        page: parsePositiveInt(req.query.page, 1),
        pageSize: parsePositiveInt(req.query.page_size ?? req.query.pageSize, 10)
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const getPlace = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const placeId = parsePositiveInt(req.params.placeId, 0);
    if (!placeId) {
      throw new ApiError(400, "placeId must be a positive integer");
    }

    res.status(200).json(await placeService.getPlace(placeId));
  } catch (error) {
    next(error);
  }
};
