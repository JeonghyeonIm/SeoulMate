import cors from "cors";
import express from "express";

import routes from "./routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    message: "SeoulMate_BE is running"
  });
});

app.use("/api", routes);

export default app;
