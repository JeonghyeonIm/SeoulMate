import { env } from "../config/env";

const BASE_URL = "https://apihub.kma.go.kr/api/typ02/openApi";

interface KmaResponse<T> {
  response: {
    header: { resultCode: string; resultMsg: string };
    body: { items: { item: T[] }; totalCount: number };
  };
}

const fetchKma = async <T>(path: string, params: Record<string, string>): Promise<T[]> => {
  if (!env.KMA_API_KEY) {
    throw new Error("KMA_API_KEY is required");
  }

  const qs = new URLSearchParams({ ...params, authKey: env.KMA_API_KEY, dataType: "JSON" });
  const url = `${BASE_URL}/${path}?${qs}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`KMA API request failed (${res.status}): ${path}`);
  }

  const json = (await res.json()) as KmaResponse<T>;
  const { resultCode, resultMsg } = json.response.header;

  if (resultCode !== "00") {
    throw new Error(`KMA API error ${resultCode}: ${resultMsg}`);
  }

  return json.response.body.items.item;
};

// ── 중기예보 ──────────────────────────────────────────────────────────────────

export interface MidTaItem {
  regId: string;
  taMin3: number;
  taMax3: number;
  taMin4: number;
  taMax4: number;
  taMin5: number;
  taMax5: number;
  taMin6: number;
  taMax6: number;
  taMin7: number;
  taMax7: number;
  taMin8: number;
  taMax8: number;
  taMin9: number;
  taMax9: number;
  taMin10: number;
  taMax10: number;
}

export interface MidLandItem {
  regId: string;
  rnSt3Am: number;
  rnSt3Pm: number;
  wf3Am: string;
  wf3Pm: string;
  rnSt4Am: number;
  rnSt4Pm: number;
  wf4Am: string;
  wf4Pm: string;
  rnSt5Am: number;
  rnSt5Pm: number;
  wf5Am: string;
  wf5Pm: string;
  rnSt6Am: number;
  rnSt6Pm: number;
  wf6Am: string;
  wf6Pm: string;
  rnSt7Am: number;
  rnSt7Pm: number;
  wf7Am: string;
  wf7Pm: string;
  rnSt8: number;
  wf8: string;
  rnSt9: number;
  wf9: string;
  rnSt10: number;
  wf10: string;
}

export const kmaClient = {
  fetchMidTa: (regId: string, tmFc: string) =>
    fetchKma<MidTaItem>("MidFcstInfoService/getMidTa", {
      pageNo: "1",
      numOfRows: "10",
      regId,
      tmFc
    }),

  fetchMidLandFcst: (regId: string, tmFc: string) =>
    fetchKma<MidLandItem>("MidFcstInfoService/getMidLandFcst", {
      pageNo: "1",
      numOfRows: "10",
      regId,
      tmFc
    }),

  // ── 단기예보 ───────────────────────────────────────────────────────────────

  fetchShortTerm: (nx: number, ny: number, baseDate: string, baseTime: string) =>
    fetchKma<Record<string, string>>("VilageFcstInfoService02/getVilageFcst", {
      pageNo: "1",
      numOfRows: "1000",
      nx: String(nx),
      ny: String(ny),
      base_date: baseDate,
      base_time: baseTime
    }),

  // ── 초단기예보 ─────────────────────────────────────────────────────────────

  fetchUltraShortTerm: (nx: number, ny: number, baseDate: string, baseTime: string) =>
    fetchKma<Record<string, string>>("VilageFcstInfoService02/getUltraSrtFcst", {
      pageNo: "1",
      numOfRows: "60",
      nx: String(nx),
      ny: String(ny),
      base_date: baseDate,
      base_time: baseTime
    }),

  // ── 초단기실황 ─────────────────────────────────────────────────────────────

  fetchUltraShortNcst: (nx: number, ny: number, baseDate: string, baseTime: string) =>
    fetchKma<Record<string, string>>("VilageFcstInfoService02/getUltraSrtNcst", {
      pageNo: "1",
      numOfRows: "10",
      nx: String(nx),
      ny: String(ny),
      base_date: baseDate,
      base_time: baseTime
    })
};
