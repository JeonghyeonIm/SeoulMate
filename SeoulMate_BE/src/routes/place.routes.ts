import { Router, type RequestHandler } from "express";

import { getPlace, searchPlaces } from "../controllers/place.controller";
import { authenticate } from "../middlewares/auth";

const placeRouter = Router();

placeRouter.get("/search", authenticate as RequestHandler, searchPlaces as RequestHandler);
placeRouter.get("/:placeId", authenticate as RequestHandler, getPlace as RequestHandler);

export default placeRouter;
