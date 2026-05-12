import { KakaoQuotaExceededError, mapClient } from "../clients/map.client";
import { db } from "../config/db";
import {
  matchKakaoUrlsForDatasets,
  processKakaoUrlMatchingBatch,
  processMenuPriceFetchBatch,
  type MenuPriceFetchRow,
  type TargetRow
} from "../services/kakaoUrlMatching.service";
import { isValidSeoulCoordinate } from "../utils/coordinates";
import logger from "../utils/logger";

const DEFAULT_LIMIT = Number(process.env.KAKAO_URL_MATCH_LIMIT ?? "200");
const REPEAT_UNTIL_DONE = process.env.KAKAO_URL_MATCH_REPEAT === "true";
const MAX_BATCHES = Number(process.env.KAKAO_URL_MATCH_MAX_BATCHES ?? "0");

const DEFAULT_TARGET_DATASETS = [
  "culturalEventInfo",
  "TbVwRestaurants",
  "culturalSpaceInfo",
  "TbVwAttractions",
  "TbVwNature",
  "SearchParkInfoService",
  "viewNightSpot"
];

const envDatasets = (process.env.KAKAO_URL_MATCH_DATASETS ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const TARGET_DATASETS = envDatasets.length ? envDatasets : DEFAULT_TARGET_DATASETS;

const GEOCODE_DATASETS = ["TbVwRestaurants", "TbVwAttractions", "TbVwNature"].filter((d) =>
  TARGET_DATASETS.includes(d)
);

const loadTargets = async (): Promise<TargetRow[]> => {
  const { rows } = await db.query<TargetRow>(
    `SELECT id, title, address, region, latitude, longitude
       FROM public_data
      WHERE source_dataset = ANY($1)
        AND title IS NOT NULL
        AND title <> ''
        AND kakao_checked_at IS NULL
      ORDER BY id ASC
      LIMIT $2`,
    [TARGET_DATASETS, DEFAULT_LIMIT]
  );
  return rows;
};

const runGeocodePhase = async (): Promise<void> => {
  if (!GEOCODE_DATASETS.length) return;

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
          NOT (latitude BETWEEN 37.413 AND 37.716 AND longitude BETWEEN 126.734 AND 127.269)
        )
      ORDER BY id ASC`,
    [GEOCODE_DATASETS]
  );

  logger.info(
    { count: rows.length, datasets: GEOCODE_DATASETS },
    "Found records needing geocoding"
  );
  if (!rows.length) return;

  let updated = 0;
  let skipped = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
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

    if (updates.length) {
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
        [updates.map((u) => u.id), updates.map((u) => u.latitude), updates.map((u) => u.longitude)]
      );
      updated += updates.length;
    }

    logger.info({ updated, skipped, total: rows.length }, "Geocoded batch");
  }

  logger.info({ updated, skipped }, "Geocoding phase completed");
};

const MENU_PRICE_LIMIT = Number(process.env.KAKAO_MENU_PRICE_LIMIT ?? "500");

const MENU_PRICE_TARGET_GROUPS = ["FD6", "CE7"];

const runMenuPricePhase = async (): Promise<void> => {
  const { rows } = await db.query<MenuPriceFetchRow>(
    `SELECT id, kakao_place_url
       FROM public_data
      WHERE kakao_place_url IS NOT NULL
        AND menu_price_fetched_at IS NULL
        AND kakao_category_group_name = ANY($1)
      ORDER BY id ASC
      LIMIT $2`,
    [MENU_PRICE_TARGET_GROUPS, MENU_PRICE_LIMIT]
  );

  if (!rows.length) {
    logger.info("No records pending menu price fetch");
    return;
  }

  logger.info({ count: rows.length }, "Starting menu price fetch phase");
  const result = await processMenuPriceFetchBatch(rows);
  logger.info(result, "Menu price fetch phase completed");
};

const run = async (): Promise<void> => {
  logger.info({ datasets: TARGET_DATASETS }, "Starting Kakao URL matching job");

  await runGeocodePhase();
  await runMenuPricePhase();

  let batch = 0;
  let totalMatched = 0;
  let totalSkipped = 0;

  while (true) {
    const rows = await loadTargets();
    if (!rows.length) {
      logger.info(
        { batch, totalMatched, totalSkipped },
        "No remaining records for Kakao URL matching"
      );
      break;
    }

    batch += 1;
    logger.info(
      { targetCount: rows.length, datasets: TARGET_DATASETS },
      "Processing Kakao URL matching batch"
    );

    try {
      const result = await processKakaoUrlMatchingBatch(rows);
      totalMatched += result.matched;
      totalSkipped += result.skipped;
      logger.info({ batch, totalMatched, totalSkipped }, "Kakao URL matching batch finished");

      if (result.quotaExceeded) {
        logger.warn(
          { batch, totalMatched, totalSkipped },
          "Stopped Kakao URL matching because Kakao Local API quota was exceeded"
        );
        break;
      }
    } catch (error) {
      if (error instanceof KakaoQuotaExceededError) {
        logger.warn(
          { batch, totalMatched, totalSkipped },
          "Stopped Kakao URL matching because Kakao Local API quota was exceeded"
        );
        break;
      }
      throw error;
    }

    if (!REPEAT_UNTIL_DONE) break;

    if (MAX_BATCHES > 0 && batch >= MAX_BATCHES) {
      logger.info(
        { batch, totalMatched, totalSkipped, maxBatches: MAX_BATCHES },
        "Stopped Kakao URL matching at configured batch limit"
      );
      break;
    }
  }

  await db.end();
};

run().catch((error) => {
  logger.error({ err: error }, "Kakao URL matching job failed");
  process.exit(1);
});
