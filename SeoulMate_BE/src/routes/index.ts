import { Router } from "express";

import authRouter from "./auth.routes";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    message: "SeoulMate API root"
  });
});

router.use("/auth", authRouter);

export default router;
