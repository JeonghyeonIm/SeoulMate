import { mapClient } from "../clients/map.client";
import { db } from "../config/db";
import { isValidSeoulCoordinate } from "../utils/coordinates";
import logger from "../utils/logger";

const BATCH_SIZE = 200;
const TARGET_DATASETS = [
  "LOCALDATA_072404",
  "LOCALDATA_072405",
  "culturalEventInfo",
  "SearchParkInfoService"
];

const run = async (): Promise<void> => {
  const { rows } = await db.query<{
    id: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `SELECT id, address, latitude, longitude
       FROM public_data
      WHERE source_dataset = ANY($1)
        AND address IS NOT NULL
        AND address <> ''
        AND (
          latitude IS NULL OR
          longitude IS NULL OR
          (latitude = 0 AND longitude = 0) OR
          (latitude = 33.4777213 AND longitude = 124.8464315) OR
          NOT (latitude BETWEEN 37.413 AND 37.716 AND longitude BETWEEN 126.734 AND 127.269)
        )
      ORDER BY id ASC`,
    [TARGET_DATASETS]
  );

  logger.info({ count: rows.length }, "Found records to repair by address geocoding");

  let updated = 0;
  let skipped = 0;

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const updates: Array<{ id: number; latitude: number; longitude: number }> = [];

    for (const row of batch) {
      const coordinate = await mapClient.geocodeAddress(row.address ?? "");
      if (!coordinate || !isValidSeoulCoordinate(coordinate.latitude, coordinate.longitude)) {
        skipped += 1;
        continue;
      }

      updates.push({
        id: Number(row.id),
        latitude: coordinate.latitude,
        longitude: coordinate.longitude
      });
    }

    if (!updates.length) {
      continue;
    }

    await db.query(
      `UPDATE public_data AS pd
          SET latitude = v.latitude,
              longitude = v.longitude,
              updated_at = now()
         FROM (
           SELECT unnest($1::bigint[]) AS id,
                  unnest($2::numeric[]) AS latitude,
                  unnest($3::numeric[]) AS longitude
         ) AS v
        WHERE pd.id = v.id`,
      [
        updates.map((item) => item.id),
        updates.map((item) => item.latitude),
        updates.map((item) => item.longitude)
      ]
    );

    updated += updates.length;
    logger.info({ updated, skipped, total: rows.length }, "Repaired coordinate batch from address");
  }

  logger.info({ updated, skipped }, "Address coordinate repair completed");
  await db.end();
};

run().catch((error) => {
  logger.error({ err: error }, "Address coordinate repair failed");
  process.exit(1);
});
