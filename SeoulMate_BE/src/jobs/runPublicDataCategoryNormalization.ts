import { db } from "../config/db";
import logger from "../utils/logger";
import { classifyPublicDataCategory } from "../utils/publicDataCategory";

const BATCH_SIZE = 1000;

const run = async (): Promise<void> => {
  let lastId = 0;
  let totalUpdated = 0;

  while (true) {
    const { rows } = await db.query<{
      id: number;
      source_dataset: string | null;
      title: string;
      category: string;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, source_dataset, title, category, metadata
         FROM public_data
        WHERE id > $1
        ORDER BY id ASC
        LIMIT $2`,
      [lastId, BATCH_SIZE]
    );

    if (!rows.length) {
      break;
    }

    const normalizedRows = rows.map((row) => ({
      id: row.id,
      normalized: classifyPublicDataCategory({
        sourceDataset: row.source_dataset,
        title: row.title,
        category: row.category,
        metadata: row.metadata ?? {}
      })
    }));

    await db.query("BEGIN");
    try {
      await db.query(
        `UPDATE public_data AS pd
            SET place_family = v.place_family,
                place_type = v.place_type,
                place_subtype = v.place_subtype,
                category_confidence = v.category_confidence,
                updated_at = now()
           FROM (
             SELECT unnest($1::bigint[]) AS id,
                    unnest($2::varchar[]) AS place_family,
                    unnest($3::varchar[]) AS place_type,
                    unnest($4::varchar[]) AS place_subtype,
                    unnest($5::numeric[]) AS category_confidence
           ) AS v
        WHERE pd.id = v.id`,
        [
          normalizedRows.map((row) => row.id),
          normalizedRows.map((row) => row.normalized.placeFamily),
          normalizedRows.map((row) => row.normalized.placeType),
          normalizedRows.map((row) => row.normalized.placeSubtype),
          normalizedRows.map((row) => row.normalized.categoryConfidence)
        ]
      );

      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    totalUpdated += rows.length;
    lastId = rows[rows.length - 1].id;
    logger.info({ totalUpdated, lastId }, "Normalized public_data category batch");
  }

  logger.info({ totalUpdated }, "Public data category normalization completed");
  await db.end();
};

run().catch((error) => {
  logger.error({ err: error }, "Public data category normalization failed");
  process.exit(1);
});
