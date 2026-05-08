import { Router, type RequestHandler } from "express";

import {
  getMe,
  getUser,
  listUsers,
  updateMyPreferences
} from "../controllers/user.controller";
import { authenticate } from "../middlewares/auth";

const userRouter = Router();

userRouter.get("/me", authenticate as RequestHandler, getMe as RequestHandler);
userRouter.patch(
  "/me/preferences",
  authenticate as RequestHandler,
  updateMyPreferences as RequestHandler
);
userRouter.get("/", authenticate as RequestHandler, listUsers as RequestHandler);
userRouter.get("/:userId", authenticate as RequestHandler, getUser as RequestHandler);

export default userRouter;
