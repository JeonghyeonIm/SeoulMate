import { db } from "../config/db";
import { syncNonRealtimePublicData } from "../services/publicData.service";
import logger from "../utils/logger";

const runPublicDataSync = async (): Promise<void> => {
  try {
    const summary = await syncNonRealtimePublicData();
    logger.info({ summary }, "Public data sync completed");
  } finally {
    await db.end();
  }
};

export default runPublicDataSync;

if (require.main === module) {
  runPublicDataSync().catch((error) => {
    logger.error({ err: error }, "Public data sync failed");
    process.exitCode = 1;
  });
}
