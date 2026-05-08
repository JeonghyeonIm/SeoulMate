import { Router } from "express";

import authRouter from "./auth.routes";
import placeRouter from "./place.routes";
import recommendationRouter from "./recommendation.routes";
import userRouter from "./user.routes";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    message: "SeoulMate API root"
  });
});

router.use("/auth", authRouter);
router.use("/courses", recommendationRouter);
router.use("/places", placeRouter);
router.use("/users", userRouter);

export default router;
