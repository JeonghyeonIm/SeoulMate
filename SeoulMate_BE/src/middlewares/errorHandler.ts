// src/middlewares/errorHandler.ts
import { type NextFunction, type Request, type Response } from "express";

import { ApiError } from "../utils/ApiError";

interface ErrorResponseBody {
  message: string;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<ErrorResponseBody>,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      message: err.message
    });

    return;
  }

  if (err instanceof Error) {
    res.status(500).json({
      message: err.message || "서버 오류가 발생했습니다."
    });

    return;
  }

  res.status(500).json({
    message: "서버 오류가 발생했습니다."
  });
}
