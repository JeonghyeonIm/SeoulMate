import { Router, type RequestHandler } from "express";

import {
  getCourse,
  listMyCourses,
  listSavedCourses,
  recommendCourse,
  removeSavedCourse,
  saveCourse
} from "../controllers/recommendation.controller";
import { authenticate } from "../middlewares/auth";

const recommendationRouter: Router = Router();

recommendationRouter.post("/recommend", authenticate as RequestHandler, recommendCourse as RequestHandler);
recommendationRouter.get("/", authenticate as RequestHandler, listMyCourses as RequestHandler);
recommendationRouter.get("/saved", authenticate as RequestHandler, listSavedCourses as RequestHandler);
recommendationRouter.get("/:courseId", authenticate as RequestHandler, getCourse as RequestHandler);
recommendationRouter.post("/:courseId/save", authenticate as RequestHandler, saveCourse as RequestHandler);
recommendationRouter.delete(
  "/:courseId/save",
  authenticate as RequestHandler,
  removeSavedCourse as RequestHandler
);

export default recommendationRouter;
