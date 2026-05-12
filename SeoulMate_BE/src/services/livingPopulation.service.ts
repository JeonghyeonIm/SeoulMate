import * as unzipper from "unzipper";

import { seoulOpenDataClient, parseCsv } from "../clients/seoulOpenData.client";
import { db } from "../config/db";
import {
  livingPopulationRepository,
  LivingPopulationUpsertInput
} from "../repositories/livingPopulation.repository";
import logger from "../utils/logger";

export interface LivingPopulationSyncSummary {
  startedAt: string;
  finishedAt: string;
  monthsProcessed: number;
  dongCount: number;
  upsertedCount: number;
}

interface Accumulator {
  sum: number;
  count: number;
}

// day_of_week: 1(월)~7(일), ISO week convention
const getDayOfWeek = (dateStr: string): number => {
  const normalized =
    dateStr.length === 8
      ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
      : dateStr;
  const date = new Date(`${normalized}T12:00:00+09:00`);
  const dow = date.getDay(); // 0=Sun
  return dow === 0 ? 7 : dow;
};

const extractCsvFromZip = async (zipBuffer: Buffer): Promise<string> => {
  const directory = await unzipper.Open.buffer(zipBuffer);
  const csvEntry = directory.files.find((f) => f.path.toLowerCase().endsWith(".csv"));
  if (!csvEntry) {
    throw new Error("ZIP 아카이브에 CSV 파일이 없습니다");
  }
  const buf = await csvEntry.buffer();

  // 서울시 공공데이터 파일은 EUC-KR 인코딩
  try {
    return new TextDecoder("euc-kr").decode(buf);
  } catch {
    return buf.toString("utf-8");
  }
};

const processRows = (
  rows: Record<string, string>[],
  patternMap: Map<string, Map<number, Map<number, Accumulator>>>
): void => {
  for (const row of rows) {
    // CSV 컬럼 순서 (헤더 인코딩 무관하게 위치 기반으로 접근):
    // [0] 기준일ID (YYYYMMDD)
    // [1] 시간대구분 (0-23)
    // [2] 행정동코드 (8자리)
    // [3] 총생활인구수 (추정 실수값)
    const vals = Object.values(row);
    const dateStr = vals[0]?.trim();
    const hourStr = vals[1]?.trim();
    const dongCode = vals[2]?.trim();
    const popStr = vals[3]?.trim();

    if (!dateStr || !hourStr || !dongCode || !popStr) continue;

    const hourCode = parseInt(hourStr, 10);
    const population = parseFloat(popStr.replace(/,/g, ""));

    if (!Number.isFinite(hourCode) || !Number.isFinite(population) || population < 0) continue;
    if (hourCode < 0 || hourCode > 23) continue;
    if (!/^\d{8,10}$/.test(dongCode)) continue;

    const dayOfWeek = getDayOfWeek(dateStr);

    if (!patternMap.has(dongCode)) patternMap.set(dongCode, new Map());
    const byDow = patternMap.get(dongCode)!;

    if (!byDow.has(dayOfWeek)) byDow.set(dayOfWeek, new Map());
    const byHour = byDow.get(dayOfWeek)!;

    const acc = byHour.get(hourCode) ?? { sum: 0, count: 0 };
    acc.sum += population;
    acc.count += 1;
    byHour.set(hourCode, acc);
  }
};

const buildUpsertItems = (
  patternMap: Map<string, Map<number, Map<number, Accumulator>>>,
  sampleMonths: number
): LivingPopulationUpsertInput[] => {
  const items: LivingPopulationUpsertInput[] = [];

  for (const [dongCode, byDow] of patternMap) {
    for (const [dayOfWeek, byHour] of byDow) {
      for (const [hourCode, { sum, count }] of byHour) {
        items.push({
          dongCode,
          dayOfWeek,
          hourCode,
          avgPopulation: Math.round(sum / count),
          sampleMonths
        });
      }
    }
  }

  return items;
};

const hasLivingPopulationData = async (): Promise<boolean> => {
  const result = await db.query<{ count: string }>(
    "SELECT count(*)::int AS count FROM living_population_stats LIMIT 1"
  );
  return parseInt(result.rows[0]?.count ?? "0", 10) > 0;
};

let livingPopulationSyncTimer: NodeJS.Timeout | null = null;

export const scheduleLivingPopulationSync = (): void => {
  const runSync = async () => {
    try {
      const summary = await syncLivingPopulationData(3);
      logger.info({ summary }, "생활인구 월간 동기화 완료");
    } catch (err) {
      logger.error({ err }, "생활인구 동기화 실패");
    }
  };

  const scheduleNext = () => {
    // 매달 1일 03:00 KST에 실행
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const next = new Date(now);
    next.setUTCDate(1);
    next.setUTCHours(3, 0, 0, 0);
    if (next.getTime() <= Date.now() + 9 * 60 * 60 * 1000) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    }
    const delay = next.getTime() - (Date.now() + 9 * 60 * 60 * 1000);
    livingPopulationSyncTimer = setTimeout(async () => {
      await runSync();
      scheduleNext();
    }, delay);
  };

  if (livingPopulationSyncTimer) clearTimeout(livingPopulationSyncTimer);

  hasLivingPopulationData()
    .then((hasData) => {
      if (!hasData) {
        logger.warn(
          "living_population_stats 테이블이 비어 있습니다. `npm run sync:living-population` 으로 초기 데이터를 적재해주세요."
        );
      }
      scheduleNext();
    })
    .catch((err) => logger.error({ err }, "생활인구 데이터 확인 실패"));
};

export const syncLivingPopulationData = async (
  monthsToProcess = 3
): Promise<LivingPopulationSyncSummary> => {
  const startedAt = new Date().toISOString();

  const fileList = await seoulOpenDataClient.fetchLivingPopulationFileList();
  if (fileList.length === 0) {
    throw new Error(
      "생활인구 파일 목록을 가져올 수 없습니다. 데이터 포털 페이지 구조를 확인해주세요."
    );
  }

  const filesToProcess = fileList.slice(0, monthsToProcess);
  logger.info({ files: filesToProcess.map((f) => f.fileName) }, "생활인구 동기화 시작");

  const patternMap = new Map<string, Map<number, Map<number, Accumulator>>>();

  for (const file of filesToProcess) {
    logger.info({ fileName: file.fileName }, "생활인구 파일 다운로드 중");
    const zipBuffer = await seoulOpenDataClient.fetchLivingPopulationZip(file.seq);

    logger.info({ fileName: file.fileName }, "ZIP 압축 해제 및 CSV 파싱 중");
    const csvContent = await extractCsvFromZip(zipBuffer);
    const rows = parseCsv(csvContent);

    processRows(rows, patternMap);
    logger.info({ fileName: file.fileName, rowCount: rows.length }, "파일 처리 완료");
  }

  const items = buildUpsertItems(patternMap, filesToProcess.length);
  const dongCount = patternMap.size;

  logger.info({ dongCount, itemCount: items.length }, "DB upsert 시작");
  await livingPopulationRepository.upsertMany(items);

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    monthsProcessed: filesToProcess.length,
    dongCount,
    upsertedCount: items.length
  };
};
