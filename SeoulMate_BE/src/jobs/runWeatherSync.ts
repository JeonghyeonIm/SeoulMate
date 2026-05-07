import { db } from "../config/db";
import { syncMediumTermForecast } from "../services/weather.service";
import logger from "../utils/logger";

syncMediumTermForecast()
  .then(() => {
    logger.info("Medium-term weather sync completed");
  })
  .catch((err) => {
    logger.error({ err }, "Medium-term weather sync failed");
    process.exit(1);
  })
  .finally(() => db.end());
