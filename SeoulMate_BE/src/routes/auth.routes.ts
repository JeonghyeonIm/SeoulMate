import { Router, type RequestHandler } from "express";

import {
  googleAuthController,
  googleCallbackController,
  kakaoAuthController,
  kakaoCallbackController,
  loginController,
  logoutController,
  refreshController,
  signupController
} from "../controllers/auth.controller";

const authRouter: Router = Router();

// 이메일(local)
authRouter.post("/signup", signupController as RequestHandler);
authRouter.post("/login", loginController as RequestHandler);
authRouter.post("/refresh", refreshController as RequestHandler);
authRouter.post("/logout", logoutController as RequestHandler);

// 카카오 OAuth
authRouter.get("/kakao", kakaoAuthController as RequestHandler);
authRouter.get("/kakao/callback", kakaoCallbackController as RequestHandler);

// 구글 OAuth
authRouter.get("/google", googleAuthController as RequestHandler);
authRouter.get("/google/callback", googleCallbackController as RequestHandler);

export default authRouter;
