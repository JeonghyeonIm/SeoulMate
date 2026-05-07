import { db } from "../config/db";
import { syncMediumTermForecast } from "../services/weather.service";

syncMediumTermForecast()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.end());
