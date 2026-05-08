import { type NextFunction, type Request, type Response } from "express";

import { userRepository } from "../repositories/user.repository";
import { ApiError } from "../utils/ApiError";
import { verifyToken } from "../utils/jwt";

export interface AuthenticatedUser {
  id: number;
  email: string;
  nickname: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const extractBearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
};

export const authenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new ApiError(401, "인증 토큰이 필요합니다.");
    }

    const payload = verifyToken(token, "access");
    const user = await userRepository.getById(Number(payload.sub));
    if (!user) {
      throw new ApiError(401, "인증된 사용자를 찾을 수 없습니다.");
    }

    req.user = {
      id: user.id,
      email: user.email,
      nickname: user.nickname
    };
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, "유효하지 않은 토큰입니다."));
  }
};

export const optionalAuthenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyToken(token, "access");
    const user = await userRepository.getById(Number(payload.sub));
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        nickname: user.nickname
      };
    }
  } catch {
    // Optional auth intentionally ignores invalid tokens.
  }

  next();
};
