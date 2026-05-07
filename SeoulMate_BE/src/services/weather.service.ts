import { kmaClient, type MidLandItem, type MidTaItem } from "../clients/kma.client";
import type { UpsertWeatherForecastInput } from "../models/weatherForecast.model";
import { weatherForecastRepository } from "../repositories/weatherForecast.repository";
import { latLngToGrid } from "../utils/kmaGrid";

// 서울 중기예보 구역코드
const SEOUL_TA_REGION = "11B10101"; // 중기기온 (서울)
const SEOUL_LAND_REGION = "11B00000"; // 중기육상 (서울·경기도)
const SEOUL_REGION_NAME = "서울";

// 서울시청 격자 좌표 (단기/초단기 기본값)
const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const toKstDate = (utcNow: Date): Date => new Date(utcNow.getTime() + KST_OFFSET_MS);

// 기상청 중기예보 발표시각: 06:00, 18:00 KST → 'YYYYMMDD0600' | 'YYYYMMDD1800'
const buildTmFc = (utcNow: Date): string => {
  const kst = toKstDate(utcNow);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = kst.getUTCHours();
  const slot = hh >= 18 ? "1800" : "0600";
  return `${yyyy}${mm}${dd}${slot}`;
};

const addDays = (dateStr: string, days: number): string => {
  // dateStr: YYYYMMDD
  const d = new Date(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(4, 6)) - 1,
    Number(dateStr.slice(6, 8))
  );
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const buildForecastItems = (
  tmFc: string,
  ta: MidTaItem,
  land: MidLandItem
): UpsertWeatherForecastInput[] => {
  const baseDateStr = tmFc.slice(0, 8);
  const items: UpsertWeatherForecastInput[] = [];

  // 3~7일: 오전/오후 구분
  for (let day = 3; day <= 7; day++) {
    const key = `${day}` as const;
    items.push({
      regionCode: SEOUL_TA_REGION,
      regionName: SEOUL_REGION_NAME,
      forecastDate: addDays(baseDateStr, day),
      tempMin: (ta as unknown as Record<string, number>)[`taMin${key}`] ?? null,
      tempMax: (ta as unknown as Record<string, number>)[`taMax${key}`] ?? null,
      rainProbAm: (land as unknown as Record<string, number>)[`rnSt${key}Am`] ?? null,
      rainProbPm: (land as unknown as Record<string, number>)[`rnSt${key}Pm`] ?? null,
      weatherAm: (land as unknown as Record<string, string>)[`wf${key}Am`] ?? null,
      weatherPm: (land as unknown as Record<string, string>)[`wf${key}Pm`] ?? null,
      baseTime: tmFc
    });
  }

  // 8~10일: 오전/오후 미구분
  for (let day = 8; day <= 10; day++) {
    const key = `${day}` as const;
    const rain = (land as unknown as Record<string, number>)[`rnSt${key}`] ?? null;
    const weather = (land as unknown as Record<string, string>)[`wf${key}`] ?? null;
    items.push({
      regionCode: SEOUL_TA_REGION,
      regionName: SEOUL_REGION_NAME,
      forecastDate: addDays(baseDateStr, day),
      tempMin: (ta as unknown as Record<string, number>)[`taMin${key}`] ?? null,
      tempMax: (ta as unknown as Record<string, number>)[`taMax${key}`] ?? null,
      rainProbAm: rain,
      rainProbPm: rain,
      weatherAm: weather,
      weatherPm: weather,
      baseTime: tmFc
    });
  }

  return items;
};

export const syncMediumTermForecast = async (): Promise<void> => {
  const tmFc = buildTmFc(new Date());

  const [taItems, landItems] = await Promise.all([
    kmaClient.fetchMidTa(SEOUL_TA_REGION, tmFc),
    kmaClient.fetchMidLandFcst(SEOUL_LAND_REGION, tmFc)
  ]);

  if (!taItems.length || !landItems.length) {
    throw new Error(`KMA 중기예보 응답 비어있음 (tmFc=${tmFc})`);
  }

  const items = buildForecastItems(tmFc, taItems[0], landItems[0]);
  await weatherForecastRepository.upsertMany(items);

  // 지난 날짜 정리 (오늘 이전 데이터 삭제)
  const today = toKstDate(new Date()).toISOString().slice(0, 10);
  await weatherForecastRepository.deleteOlderThan(today);

  console.log(JSON.stringify({ event: "weather_sync_completed", tmFc, count: items.length }));
};

export const getMediumTermForecast = async (
  targetDate?: string
): Promise<UpsertWeatherForecastInput | null> => {
  const tmFc = buildTmFc(new Date());

  const [taItems, landItems] = await Promise.all([
    kmaClient.fetchMidTa(SEOUL_TA_REGION, tmFc),
    kmaClient.fetchMidLandFcst(SEOUL_LAND_REGION, tmFc)
  ]);

  if (!taItems.length || !landItems.length) {
    return null;
  }

  const items = buildForecastItems(tmFc, taItems[0], landItems[0]);
  return (
    items.find((item) => (targetDate ? item.forecastDate === targetDate.slice(0, 10) : false)) ??
    items[0] ??
    null
  );
};

// ── 단기/초단기 실시간 조회 ────────────────────────────────────────────────────

const buildHourlyBaseTime = (utcNow: Date): { baseDate: string; baseTime: string } => {
  const kst = toKstDate(utcNow);
  const kstMinusDelay = new Date(kst.getTime() - 10 * 60 * 1000);
  const h = kstMinusDelay.getUTCHours();

  return {
    baseDate: kstMinusDelay.toISOString().slice(0, 10).replace(/-/g, ""),
    baseTime: String(h).padStart(2, "0") + "00"
  };
};

const buildUltraShortForecastBaseTime = (
  utcNow: Date
): { baseDate: string; baseTime: string } => {
  const kst = toKstDate(utcNow);
  const kstMinusDelay = new Date(kst.getTime() - 45 * 60 * 1000);
  return {
    baseDate: kstMinusDelay.toISOString().slice(0, 10).replace(/-/g, ""),
    baseTime: String(kstMinusDelay.getUTCHours()).padStart(2, "0") + "30"
  };
};

const buildShortTermBaseTime = (utcNow: Date): { baseDate: string; baseTime: string } => {
  const kst = toKstDate(utcNow);
  const kstMinusDelay = new Date(kst.getTime() - 10 * 60 * 1000);
  const baseHours = [2, 5, 8, 11, 14, 17, 20, 23];
  const hour = kstMinusDelay.getUTCHours();
  const slot = [...baseHours].reverse().find((baseHour) => baseHour <= hour);

  if (slot !== undefined) {
    return {
      baseDate: kstMinusDelay.toISOString().slice(0, 10).replace(/-/g, ""),
      baseTime: String(slot).padStart(2, "0") + "00"
    };
  }

  const previousDay = new Date(kstMinusDelay.getTime() - 24 * 60 * 60 * 1000);
  return {
    baseDate: previousDay.toISOString().slice(0, 10).replace(/-/g, ""),
    baseTime: "2300"
  };
};

export const getShortTermForecast = async (lat: number, lng: number) => {
  const { nx, ny } = latLngToGrid(lat, lng);
  const { baseDate, baseTime } = buildShortTermBaseTime(new Date());
  return kmaClient.fetchShortTerm(nx, ny, baseDate, baseTime);
};

export const getUltraShortTermForecast = async (lat: number, lng: number) => {
  const { nx, ny } = latLngToGrid(lat, lng);
  const { baseDate, baseTime } = buildUltraShortForecastBaseTime(new Date());
  return kmaClient.fetchUltraShortTerm(nx, ny, baseDate, baseTime);
};

export const getCurrentWeather = async (lat: number, lng: number) => {
  const { nx, ny } = latLngToGrid(lat, lng);
  const { baseDate, baseTime } = buildHourlyBaseTime(new Date());
  return kmaClient.fetchUltraShortNcst(nx, ny, baseDate, baseTime);
};

export const getSeoulDefaultGrid = () => latLngToGrid(SEOUL_CITY_HALL.lat, SEOUL_CITY_HALL.lng);

// ── 스케줄러 ───────────────────────────────────────────────────────────────────

let weatherSyncTimer: NodeJS.Timeout | null = null;

const getDelayUntilNextWeatherSync = (): number => {
  const kst = toKstDate(new Date());
  // 다음 발표시각: 06:10 또는 18:10 KST
  const slots = [
    { h: 6, m: 10 },
    { h: 18, m: 10 }
  ];

  const candidates = slots.map(({ h, m }) => {
    const candidate = new Date(kst);
    candidate.setUTCHours(h, m, 0, 0);
    if (candidate.getTime() <= kst.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate;
  });

  const nextSync = candidates.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
  return nextSync.getTime() - kst.getTime();
};

export const scheduleMediumTermForecastSync = (): void => {
  const scheduleNext = () => {
    const delay = getDelayUntilNextWeatherSync();
    weatherSyncTimer = setTimeout(async () => {
      try {
        await syncMediumTermForecast();
      } catch (err) {
        console.error("Weather sync failed", err);
      } finally {
        scheduleNext();
      }
    }, delay);
  };

  if (weatherSyncTimer) {
    clearTimeout(weatherSyncTimer);
  }

  scheduleNext();
};
