// src/controllers/auth.controller.ts
import { type NextFunction, type Request, type Response } from "express";

import { signup } from "../services/auth.service";
import { type SignupRequestBody, type SignupResponseBody } from "../types/auth.types";
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
