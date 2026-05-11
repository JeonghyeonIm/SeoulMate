import { mapClient, type KakaoLocalPlace } from "../clients/map.client";
import { db } from "../config/db";
import { isValidSeoulCoordinate } from "../utils/coordinates";
import logger from "../utils/logger";
import {
  classifyKakaoPlaceCategory,
  isEligibleKakaoPlaceCategory,
  type NormalizedPublicDataCategory
} from "../utils/publicDataCategory";

const DEFAULT_LIMIT = Number(process.env.KAKAO_NORMALIZE_LIMIT ?? "300");
const PROCESS_ALL = process.env.KAKAO_NORMALIZE_PROCESS_ALL === "true";
const REPEAT_UNTIL_DONE = process.env.KAKAO_NORMALIZE_REPEAT === "true";
const MAX_BATCHES = Number(process.env.KAKAO_NORMALIZE_MAX_BATCHES ?? "0");
const SEARCH_SIZE = 5;
const MIN_CONFIDENCE = 74;
const MAX_DISTANCE_METER = 700;
const TARGET_DATASETS = (
  process.env.KAKAO_NORMALIZE_DATASETS ?? "LOCALDATA_072404,LOCALDATA_072405"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const TARGET_PLACE_TYPES = (
  process.env.KAKAO_NORMALIZE_PLACE_TYPES ?? "generic_eatery,casual_eatery,takeout_eatery"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

interface TargetRow {
  id: number;
  title: string;
  address: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string;
  place_type: string | null;
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

  if (!left || !right) {
    return 0;
  }

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

  if (!cleaned || cleaned.length < 2) {
    return undefined;
  }

  return cleaned;
};

const buildQueries = (row: TargetRow): string[] =>
  [
    ...new Set([row.title, `${row.title} ${row.region ?? ""}`, simplifyAddress(row.address)])
  ].filter((value): value is string => Boolean(value?.trim()));

const scoreMatch = (row: TargetRow, place: KakaoLocalPlace): number => {
  let score = stringScore(row.title, place.placeName);
  const kakaoAddress = `${place.roadAddressName ?? ""} ${place.addressName ?? ""}`;

  if (row.address) {
    score += stringScore(row.address, kakaoAddress);
  }

  if (row.region && kakaoAddress.includes(row.region)) {
    score += 10;
  }

  if (typeof place.distanceMeter === "number") {
    if (place.distanceMeter <= 80) score += 30;
    else if (place.distanceMeter <= 250) score += 22;
    else if (place.distanceMeter <= 500) score += 14;
    else if (place.distanceMeter <= MAX_DISTANCE_METER) score += 6;
    else score -= 15;
  }

  const normalizedCategory = classifyKakaoPlaceCategory({
    categoryName: place.categoryName,
    categoryGroupName: place.categoryGroupName,
    placeName: place.placeName
  });

  if (normalizedCategory?.placeType) {
    score += 8;
  }

  return Math.round(score);
};

const resolveCoordinate = (row: TargetRow): { latitude: number; longitude: number } | undefined => {
  if (!isValidSeoulCoordinate(row.latitude, row.longitude)) {
    return undefined;
  }

  return {
    latitude: row.latitude as number,
    longitude: row.longitude as number
  };
};

const findBestMatch = async (
  row: TargetRow
): Promise<{
  place: KakaoLocalPlace;
  confidence: number;
  normalized: NormalizedPublicDataCategory;
} | null> => {
  const coordinate = resolveCoordinate(row);
  const matches: Array<KakaoLocalPlace & { confidence: number }> = [];

  for (const query of buildQueries(row).slice(0, 2)) {
    const results = await mapClient.searchPlacesByKeyword(query, {
      coordinate,
      radiusMeter: coordinate ? 2000 : undefined,
      size: SEARCH_SIZE
    });

    matches.push(
      ...results.map((result) => ({
        ...result,
        confidence: scoreMatch(row, result)
      }))
    );
  }

  const best = matches.sort((left, right) => right.confidence - left.confidence)[0];
  if (!best || best.confidence < MIN_CONFIDENCE) {
    return null;
  }

  if (typeof best.distanceMeter === "number" && best.distanceMeter > MAX_DISTANCE_METER) {
    return null;
  }

  const normalized = classifyKakaoPlaceCategory({
    categoryName: best.categoryName,
    categoryGroupName: best.categoryGroupName,
    placeName: best.placeName
  });

  if (
    !isEligibleKakaoPlaceCategory({
      categoryName: best.categoryName,
      categoryGroupName: best.categoryGroupName,
      placeName: best.placeName
    })
  ) {
    return null;
  }

  if (!normalized?.placeFamily || !normalized.placeType) {
    return null;
  }

  return {
    place: best,
    confidence: best.confidence,
    normalized
  };
};

const loadTargets = async (): Promise<TargetRow[]> => {
  const filters: string[] = [
    `source_dataset = ANY($1)`,
    `title IS NOT NULL`,
    `title <> ''`,
    `kakao_checked_at IS NULL`
  ];
  const values: unknown[] = [TARGET_DATASETS];

  if (!PROCESS_ALL && TARGET_PLACE_TYPES.length) {
    values.push(TARGET_PLACE_TYPES);
    filters.push(`place_type = ANY($${values.length})`);
  }

  values.push(DEFAULT_LIMIT);

  const { rows } = await db.query<TargetRow>(
    `SELECT id, title, address, region, latitude, longitude, category, place_type
       FROM public_data
      WHERE ${filters.join("\n        AND ")}
      ORDER BY id ASC
      LIMIT $${values.length}`,
    values
  );

  return rows;
};

const processBatch = async (rows: TargetRow[]): Promise<{ matched: number; skipped: number }> => {
  logger.info(
    {
      targetCount: rows.length,
      datasets: TARGET_DATASETS,
      processAll: PROCESS_ALL,
      placeTypes: PROCESS_ALL ? "ALL" : TARGET_PLACE_TYPES
    },
    "Found permit rows for Kakao category normalization"
  );

  let matched = 0;
  let skipped = 0;
  const updates: Array<{
    id: number;
    placeFamily: string | null;
    placeType: string | null;
    placeSubtype: string | null;
    categoryConfidence: number | null;
    kakaoPlaceName: string | null;
    kakaoPlaceUrl: string | null;
    kakaoCategoryName: string | null;
    kakaoCategoryGroupName: string | null;
    kakaoMatchConfidence: number | null;
  }> = [];
  const skippedIds: number[] = [];

  for (const row of rows) {
    const best = await findBestMatch(row);
    if (!best) {
      skipped += 1;
      skippedIds.push(row.id);
      continue;
    }

    updates.push({
      id: row.id,
      placeFamily: best.normalized.placeFamily,
      placeType: best.normalized.placeType,
      placeSubtype: best.normalized.placeSubtype,
      categoryConfidence: Math.max(best.normalized.categoryConfidence ?? 0, 0.92),
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
          SET place_family = v.place_family,
              place_type = v.place_type,
              place_subtype = v.place_subtype,
              category_confidence = v.category_confidence,
              kakao_place_name = v.kakao_place_name,
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
                  unnest($2::varchar[]) AS place_family,
                  unnest($3::varchar[]) AS place_type,
                  unnest($4::varchar[]) AS place_subtype,
                  unnest($5::numeric[]) AS category_confidence,
                  unnest($6::varchar[]) AS kakao_place_name,
                  unnest($7::text[]) AS kakao_place_url,
                  unnest($8::varchar[]) AS kakao_category_name,
                  unnest($9::varchar[]) AS kakao_category_group_name,
                  unnest($10::numeric[]) AS kakao_match_confidence
         ) AS v
        WHERE pd.id = v.id`,
      [
        updates.map((item) => item.id),
        updates.map((item) => item.placeFamily),
        updates.map((item) => item.placeType),
        updates.map((item) => item.placeSubtype),
        updates.map((item) => item.categoryConfidence),
        updates.map((item) => item.kakaoPlaceName),
        updates.map((item) => item.kakaoPlaceUrl),
        updates.map((item) => item.kakaoCategoryName),
        updates.map((item) => item.kakaoCategoryGroupName),
        updates.map((item) => item.kakaoMatchConfidence)
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

  matched = updates.length;
  logger.info(
    { matched, skipped, targetCount: rows.length },
    "Kakao place category normalization completed"
  );
  return { matched, skipped };
};

const run = async (): Promise<void> => {
  let batch = 0;
  let totalMatched = 0;
  let totalSkipped = 0;

  while (true) {
    const rows = await loadTargets();
    if (!rows.length) {
      logger.info(
        { batch, totalMatched, totalSkipped },
        "No remaining permit rows for Kakao category normalization"
      );
      break;
    }

    batch += 1;
    const result = await processBatch(rows);
    totalMatched += result.matched;
    totalSkipped += result.skipped;

    logger.info(
      { batch, totalMatched, totalSkipped },
      "Kakao place category normalization batch finished"
    );

    if (!REPEAT_UNTIL_DONE) {
      break;
    }

    if (MAX_BATCHES > 0 && batch >= MAX_BATCHES) {
      logger.info(
        { batch, totalMatched, totalSkipped, maxBatches: MAX_BATCHES },
        "Stopped Kakao category normalization at configured batch limit"
      );
      break;
    }
  }

  await db.end();
};

run().catch((error) => {
  logger.error({ err: error }, "Kakao place category normalization failed");
  process.exit(1);
});
