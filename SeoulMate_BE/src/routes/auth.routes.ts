// src/routes/auth.routes.ts
import { Router, type RequestHandler } from "express";

import { signupController } from "../controllers/auth.controller";

const authRouter: Router = Router();

authRouter.post("/signup", signupController as RequestHandler);

export default authRouter;
