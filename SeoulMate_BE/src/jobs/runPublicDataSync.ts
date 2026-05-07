import { db } from "../config/db";
import { syncNonRealtimePublicData } from "../services/publicData.service";

const runPublicDataSync = async (): Promise<void> => {
  try {
    const summary = await syncNonRealtimePublicData();
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await db.end();
  }
};

export default runPublicDataSync;

if (require.main === module) {
  runPublicDataSync().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
