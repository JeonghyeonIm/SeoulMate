import app from "./app";
import { env } from "./config/env";
import { scheduleDailyPublicDataSync } from "./services/publicData.service";

app.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`);
  scheduleDailyPublicDataSync();
});
