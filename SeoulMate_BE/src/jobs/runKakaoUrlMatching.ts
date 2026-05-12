import { KakaoQuotaExceededError, mapClient, type KakaoLocalPlace } from "../clients/map.client";
import { db } from "../config/db";
import { isValidSeoulCoordinate } from "../utils/coordinates";
import logger from "../utils/logger";

const DEFAULT_LIMIT = Number(process.env.KAKAO_URL_MATCH_LIMIT ?? "200");
const REPEAT_UNTIL_DONE = process.env.KAKAO_URL_MATCH_REPEAT === "true";
const MAX_BATCHES = Number(process.env.KAKAO_URL_MATCH_MAX_BATCHES ?? "0");
const SEARCH_SIZE = 5;
const MIN_CONFIDENCE = 45;
const MAX_DISTANCE_METER = 1000;

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

interface TargetRow {
  id: number;
  title: string;
  address: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^0-9a-z가-힣]/g, "")
    .trim();

const stringScore = (candidate: string, kakao: string): number => {
  const left = normalize(candidate);
  const right = normalize(kakao);
  if (!left || !right) return 0;
  if (left === right) return 52;
  if (left.includes(right) || right.includes(left)) return 40;
  const leftTokens = candidate
    .split(/\s+/)
    .map(normalize)
    .filter((token) => token.length >= 2);
  const matches = leftTokens.filter((token) => right.includes(token)).length;
  return Math.min(28, matches * 8);
};

const simplifyAddress = (address?: string | null): string | undefined => {
  const cleaned = address
    ?.replace(/\([^)]*\)/g, " ")
    .split(/[,\n]/)[0]
    ?.trim();
  return cleaned && cleaned.length >= 2 ? cleaned : undefined;
};

const buildQueries = (row: TargetRow): string[] =>
  [
    ...new Set([row.title, `${row.title} ${row.region ?? ""}`, simplifyAddress(row.address)])
  ].filter((v): v is string => Boolean(v?.trim()));

const scoreMatch = (row: TargetRow, place: KakaoLocalPlace): number => {
  let score = stringScore(row.title, place.placeName);
  const kakaoAddress = `${place.roadAddressName ?? ""} ${place.addressName ?? ""}`;
  if (row.address) score += stringScore(row.address, kakaoAddress);
  if (row.region && kakaoAddress.includes(row.region)) score += 10;

  if (typeof place.distanceMeter === "number") {
    if (place.distanceMeter <= 80) score += 30;
    else if (place.distanceMeter <= 250) score += 22;
    else if (place.distanceMeter <= 500) score += 14;
    else if (place.distanceMeter <= MAX_DISTANCE_METER) score += 6;
    else score -= 15;
  }

  return Math.round(score);
};

const resolveCoordinate = (row: TargetRow): { latitude: number; longitude: number } | undefined => {
  if (!isValidSeoulCoordinate(row.latitude, row.longitude)) return undefined;
  return { latitude: row.latitude as number, longitude: row.longitude as number };
};

const findBestMatch = async (
  row: TargetRow
): Promise<{ place: KakaoLocalPlace; confidence: number } | null> => {
  const coordinate = resolveCoordinate(row);
  const matches: Array<KakaoLocalPlace & { confidence: number }> = [];

  for (const query of buildQueries(row).slice(0, 2)) {
    const results = await mapClient.searchPlacesByKeyword(query, {
      coordinate,
      radiusMeter: coordinate ? 2000 : undefined,
      size: SEARCH_SIZE
    });
    matches.push(...results.map((result) => ({ ...result, confidence: scoreMatch(row, result) })));
  }

  const best = matches.sort((a, b) => b.confidence - a.confidence)[0];
  if (!best || best.confidence < MIN_CONFIDENCE) return null;
  if (typeof best.distanceMeter === "number" && best.distanceMeter > MAX_DISTANCE_METER)
    return null;
  return { place: best, confidence: best.confidence };
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

const processBatch = async (rows: TargetRow[]): Promise<{ matched: number; skipped: number }> => {
  logger.info(
    { targetCount: rows.length, datasets: TARGET_DATASETS },
    "Processing Kakao URL matching batch"
  );

  const updates: Array<{
    id: number;
    kakaoPlaceName: string | null;
    kakaoPlaceUrl: string | null;
    kakaoCategoryName: string | null;
    kakaoCategoryGroupName: string | null;
    kakaoMatchConfidence: number | null;
  }> = [];
  const skippedIds: number[] = [];
  let quotaExceeded = false;

  for (const row of rows) {
    let best: Awaited<ReturnType<typeof findBestMatch>>;
    try {
      best = await findBestMatch(row);
    } catch (error) {
      if (error instanceof KakaoQuotaExceededError) {
        quotaExceeded = true;
        logger.warn({ rowId: row.id, title: row.title }, "Kakao Local API quota exceeded");
        break;
      }
      throw error;
    }

    if (!best) {
      skippedIds.push(row.id);
      continue;
    }

    updates.push({
      id: row.id,
      kakaoPlaceName: best.place.placeName ?? null,
      kakaoPlaceUrl: best.place.placeUrl ?? null,
      kakaoCategoryName: best.place.categoryName ?? null,
      kakaoCategoryGroupName: best.place.categoryGroupName ?? null,
      kakaoMatchConfidence: best.confidence
    });
  }

  if (updates.length) {
    await db.query(
      `UPDATE public_data AS pd
          SET kakao_place_name = v.kakao_place_name,
              kakao_place_url = v.kakao_place_url,
              kakao_category_name = v.kakao_category_name,
              kakao_category_group_name = v.kakao_category_group_name,
              kakao_match_confidence = v.kakao_match_confidence,
              kakao_match_status = 'matched',
              kakao_checked_at = now(),
              kakao_matched_at = now(),
              updated_at = now()
         FROM (
           SELECT unnest($1::bigint[]) AS id,
                  unnest($2::varchar[]) AS kakao_place_name,
                  unnest($3::text[]) AS kakao_place_url,
                  unnest($4::varchar[]) AS kakao_category_name,
                  unnest($5::varchar[]) AS kakao_category_group_name,
                  unnest($6::numeric[]) AS kakao_match_confidence
         ) AS v
        WHERE pd.id = v.id`,
      [
        updates.map((u) => u.id),
        updates.map((u) => u.kakaoPlaceName),
        updates.map((u) => u.kakaoPlaceUrl),
        updates.map((u) => u.kakaoCategoryName),
        updates.map((u) => u.kakaoCategoryGroupName),
        updates.map((u) => u.kakaoMatchConfidence)
      ]
    );
  }

  if (skippedIds.length) {
    await db.query(
      `UPDATE public_data
          SET kakao_match_status = 'skipped',
              kakao_checked_at = now(),
              updated_at = now()
        WHERE id = ANY($1::bigint[])`,
      [skippedIds]
    );
  }

  const matched = updates.length;
  const skipped = skippedIds.length;
  logger.info(
    { matched, skipped, targetCount: rows.length, quotaExceeded },
    "Kakao URL matching batch completed"
  );

  if (quotaExceeded) throw new KakaoQuotaExceededError();
  return { matched, skipped };
};

const run = async (): Promise<void> => {
  logger.info({ datasets: TARGET_DATASETS }, "Starting Kakao URL matching job");

  await runGeocodePhase();

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
    try {
      const result = await processBatch(rows);
      totalMatched += result.matched;
      totalSkipped += result.skipped;
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

    logger.info({ batch, totalMatched, totalSkipped }, "Kakao URL matching batch finished");

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
