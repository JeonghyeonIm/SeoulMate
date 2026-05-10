import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { env } from "./config/env";
import { errorHandler } from "./middlewares/errorHandler";
import routes from "./routes";
import { httpLogger } from "./utils/logger";

const app = express();

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true
  })
);
app.use(httpLogger);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    message: "SeoulMate_BE is running"
  });
});

app.use("/api", routes);
app.use(routes);
app.use(errorHandler);

export default app;
