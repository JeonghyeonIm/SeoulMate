import app from "./app";
import { env } from "./config/env";
import { scheduleDailyPublicDataSync } from "./services/publicData.service";
import { scheduleMediumTermForecastSync } from "./services/weather.service";
import logger from "./utils/logger";

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server listening");
  scheduleDailyPublicDataSync();
  scheduleMediumTermForecastSync();
});
