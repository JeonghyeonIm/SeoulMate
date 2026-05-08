import { db } from "../config/db";
import { syncLivingPopulationData } from "../services/livingPopulation.service";
import logger from "../utils/logger";

const MONTHS_TO_PROCESS = parseInt(process.env.LIVING_POP_MONTHS ?? "3", 10);

const run = async (): Promise<void> => {
  try {
    const summary = await syncLivingPopulationData(MONTHS_TO_PROCESS);
    logger.info({ summary }, "생활인구 동기화 완료");
  } finally {
    await db.end();
  }
};

export default run;

if (require.main === module) {
  run().catch((error) => {
    logger.error({ err: error }, "생활인구 동기화 실패");
    process.exitCode = 1;
  });
}
