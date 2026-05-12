import { KakaoQuotaExceededError, mapClient, type KakaoLocalPlace } from "../clients/map.client";
import { db } from "../config/db";
import { isValidSeoulCoordinate } from "../utils/coordinates";
import logger from "../utils/logger";

const SEARCH_SIZE = 5;
const MIN_CONFIDENCE = 45;
const MAX_DISTANCE_METER = 1000;

export interface TargetRow {
  id: number;
  title: string;
  address: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface MatchBatchResult {
  matched: number;
  skipped: number;
  quotaExceeded: boolean;
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

export const simplifyAddress = (address?: string | null): string | undefined => {
  const cleaned = address
    ?.replace(/\([^)]*\)/g, " ")
    .split(/[,\n]/)[0]
    ?.trim();
  return cleaned && cleaned.length >= 2 ? cleaned : undefined;
};

export const buildMatchQueries = (row: TargetRow): string[] =>
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

export const findBestKakaoMatch = async (
  row: TargetRow
): Promise<{ place: KakaoLocalPlace; confidence: number } | null> => {
  const coordinate = resolveCoordinate(row);
  const matches: Array<KakaoLocalPlace & { confidence: number }> = [];

  for (const query of buildMatchQueries(row).slice(0, 2)) {
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

export const processKakaoUrlMatchingBatch = async (
  rows: TargetRow[]
): Promise<MatchBatchResult> => {
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
    let best: Awaited<ReturnType<typeof findBestKakaoMatch>>;
    try {
      best = await findBestKakaoMatch(row);
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

  return { matched: updates.length, skipped: skippedIds.length, quotaExceeded };
};

const KAKAO_PLACE_MAIN_BASE = "https://place.map.kakao.com/main/v";

const parseMenuPriceStr = (priceStr: string): number | null => {
  const digits = priceStr.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return value > 0 ? value : null;
};

export const fetchKakaoMenuPrice = async (
  kakaoPlaceUrl: string
): Promise<{ name: string; price: number } | null> => {
  const placeId = kakaoPlaceUrl.split("/").filter(Boolean).pop();
  if (!placeId || !/^\d+$/.test(placeId)) return null;

  try {
    const res = await fetch(`${KAKAO_PLACE_MAIN_BASE}/${placeId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SeoulMate/1.0)",
        Referer: `https://place.map.kakao.com/${placeId}`
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const menuInfo = data?.menuInfo as Record<string, unknown> | undefined;
    const menuList = menuInfo?.menuList;
    if (!Array.isArray(menuList) || menuList.length === 0) return null;

    const first = menuList[0] as Record<string, unknown>;
    const name = typeof first.menu === "string" ? first.menu.trim() : null;
    const price = typeof first.price === "string" ? parseMenuPriceStr(first.price) : null;

    if (!name || price === null) return null;
    return { name, price };
  } catch {
    return null;
  }
};

export interface MenuPriceFetchRow {
  id: number;
  kakao_place_url: string;
}

export interface MenuPriceBatchResult {
  fetched: number;
  skipped: number;
}

export const processMenuPriceFetchBatch = async (
  rows: MenuPriceFetchRow[]
): Promise<MenuPriceBatchResult> => {
  const updates: Array<{ id: number; name: string; price: number }> = [];

  for (const row of rows) {
    const result = await fetchKakaoMenuPrice(row.kakao_place_url);
    if (result) {
      updates.push({ id: row.id, name: result.name, price: result.price });
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  if (updates.length) {
    await db.query(
      `UPDATE public_data AS pd
          SET menu_price_first      = v.price,
              menu_name_first       = v.name,
              menu_price_fetched_at = now(),
              updated_at            = now()
         FROM (
           SELECT unnest($1::bigint[])  AS id,
                  unnest($2::integer[]) AS price,
                  unnest($3::varchar[]) AS name
         ) AS v
        WHERE pd.id = v.id`,
      [updates.map((u) => u.id), updates.map((u) => u.price), updates.map((u) => u.name)]
    );
  }

  const updatedIds = new Set(updates.map((u) => u.id));
  const skippedIds = rows.map((r) => r.id).filter((id) => !updatedIds.has(id));

  if (skippedIds.length) {
    await db.query(
      `UPDATE public_data
          SET menu_price_fetched_at = now(),
              updated_at            = now()
        WHERE id = ANY($1::bigint[])`,
      [skippedIds]
    );
  }

  return { fetched: updates.length, skipped: skippedIds.length };
};

export const matchKakaoUrlsForDatasets = async (
  datasets: string[],
  limit = 200
): Promise<{ matched: number; skipped: number }> => {
  const { rows } = await db.query<TargetRow>(
    `SELECT id, title, address, region, latitude, longitude
       FROM public_data
      WHERE source_dataset = ANY($1)
        AND title IS NOT NULL
        AND title <> ''
        AND kakao_checked_at IS NULL
      ORDER BY id ASC
      LIMIT $2`,
    [datasets, limit]
  );

  if (!rows.length) {
    logger.info({ datasets }, "No unmatched records for Kakao URL matching");
    return { matched: 0, skipped: 0 };
  }

  logger.info({ count: rows.length, datasets }, "Starting Kakao URL matching");
  const { matched, skipped, quotaExceeded } = await processKakaoUrlMatchingBatch(rows);

  if (quotaExceeded) {
    logger.warn({ matched, skipped }, "Kakao URL matching stopped due to quota exceeded");
  } else {
    logger.info({ matched, skipped }, "Kakao URL matching completed");
  }

  return { matched, skipped };
};
