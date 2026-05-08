// src/middlewares/errorHandler.ts
import { type NextFunction, type Request, type Response } from "express";

import { ApiError } from "../utils/ApiError";

interface ErrorResponseBody {
  status: number;
  message: string;
}

const DEFAULT_ERROR_MESSAGE = "서버 오류가 발생했습니다.";

const getHttpStatus = (err: unknown): number | undefined => {
  if (!err || typeof err !== "object") {
    return undefined;
  }

  const status = (err as { status?: unknown; statusCode?: unknown }).status;
  const statusCode = (err as { status?: unknown; statusCode?: unknown }).statusCode;
  const candidate = typeof status === "number" ? status : statusCode;

  return typeof candidate === "number" && candidate >= 400 && candidate < 600
    ? candidate
    : undefined;
};

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<ErrorResponseBody>,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      status: err.statusCode,
      message: err.message
    });

    return;
  }

  const httpStatus = getHttpStatus(err);
  if (httpStatus && httpStatus < 500) {
    res.status(httpStatus).json({
      status: httpStatus,
      message: httpStatus === 400 ? "요청 형식이 올바르지 않습니다." : DEFAULT_ERROR_MESSAGE
    });

    return;
  }

  res.status(500).json({
    status: 500,
    message: DEFAULT_ERROR_MESSAGE
  });
}
