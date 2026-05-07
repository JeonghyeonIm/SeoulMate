// src/routes/auth.routes.ts
import { Router, type RequestHandler } from "express";

import {
  loginController,
  logoutController,
  refreshController,
  signupController
} from "../controllers/auth.controller";

const authRouter: Router = Router();

authRouter.post("/signup", signupController as RequestHandler);
authRouter.post("/login", loginController as RequestHandler);
authRouter.post("/refresh", refreshController as RequestHandler);
authRouter.post("/logout", logoutController as RequestHandler);

export default authRouter;
