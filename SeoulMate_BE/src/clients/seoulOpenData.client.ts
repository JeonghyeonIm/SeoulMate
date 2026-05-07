import { env } from "../config/env";

interface SeoulOpenApiResult {
  CODE: string;
  MESSAGE: string;
}

interface SeoulOpenApiPayload<T> {
  list_total_count: number;
  RESULT: SeoulOpenApiResult;
  row: T[];
}

export interface SeoulOpenApiPage<T> {
  totalCount: number;
  rows: T[];
}

export interface SeoulCityDataPayload {
  AREA_NM?: string;
  LIVE_PPLTN_STTS?: Array<Record<string, unknown>>;
  ROAD_TRAFFIC_STTS?: Record<string, unknown> | Array<Record<string, unknown>>;
  WEATHER_STTS?: Array<Record<string, unknown>> | Record<string, unknown>;
}

const SEOUL_OPEN_API_BASE_URL = "http://openapi.seoul.go.kr:8088";
const FOOD_HYGIENE_LIST_URL =
  "https://data.seoul.go.kr/dataList/datasetView.do?currentPageNo=&infId=OA-13663&searchKey=&searchValue=&serviceKind=1&srvType=F";
const FOOD_HYGIENE_DOWNLOAD_URL =
  "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false";

const htmlEntityMap: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " "
};

const decodeHtmlEntities = (value: string): string =>
  value.replace(
    /&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g,
    (entity) => htmlEntityMap[entity] ?? entity
  );

export const stripHtml = (value: string): string =>
  decodeHtmlEntities(value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const fetchText = async (url: string, init?: RequestInit): Promise<string> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.text();
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as T;
};

const parseCsv = (content: string): Record<string, string>[] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  if (!rows.length) {
    return [];
  }

  const [header, ...dataRows] = rows;

  return dataRows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row) =>
      header.reduce<Record<string, string>>((accumulator, columnName, columnIndex) => {
        accumulator[columnName.trim()] = row[columnIndex]?.trim() ?? "";
        return accumulator;
      }, {})
    );
};

const buildSeoulOpenApiUrl = (serviceName: string, startIndex: number, endIndex: number): string =>
  `${SEOUL_OPEN_API_BASE_URL}/${env.SEOUL_OPEN_API_KEY}/json/${serviceName}/${startIndex}/${endIndex}/`;

const buildSeoulCityDataUrl = (areaName: string): string =>
  `${SEOUL_OPEN_API_BASE_URL}/${env.SEOUL_OPEN_API_KEY}/json/citydata/1/5/${encodeURIComponent(areaName)}`;

export const seoulOpenDataClient = {
  async fetchSeoulOpenApiPage<T>(
    serviceName: string,
    startIndex: number,
    endIndex: number
  ): Promise<SeoulOpenApiPage<T>> {
    if (!env.SEOUL_OPEN_API_KEY) {
      throw new Error("SEOUL_OPEN_API_KEY is required");
    }

    const payload = await fetchJson<Record<string, SeoulOpenApiPayload<T> | SeoulOpenApiResult>>(
      buildSeoulOpenApiUrl(serviceName, startIndex, endIndex)
    );

    const data = payload[serviceName] as SeoulOpenApiPayload<T> | undefined;
    if (data) {
      if (data.RESULT.CODE !== "INFO-000") {
        throw new Error(`${serviceName}: ${data.RESULT.MESSAGE}`);
      }

      return {
        totalCount: data.list_total_count,
        rows: data.row ?? []
      };
    }

    const result = payload.RESULT as SeoulOpenApiResult | undefined;
    throw new Error(`${serviceName}: ${result?.MESSAGE ?? "Unknown response"}`);
  },

  async fetchAllSeoulOpenApiRows<T>(serviceName: string, pageSize = 1000): Promise<T[]> {
    const firstPage = await this.fetchSeoulOpenApiPage<T>(serviceName, 1, pageSize);
    const rows = [...firstPage.rows];

    for (
      let startIndex = pageSize + 1;
      startIndex <= firstPage.totalCount;
      startIndex += pageSize
    ) {
      const endIndex = Math.min(startIndex + pageSize - 1, firstPage.totalCount);
      const page = await this.fetchSeoulOpenApiPage<T>(serviceName, startIndex, endIndex);
      rows.push(...page.rows);
    }

    return rows;
  },

  async fetchCityData(areaName: string): Promise<SeoulCityDataPayload> {
    if (!env.SEOUL_OPEN_API_KEY) {
      throw new Error("SEOUL_OPEN_API_KEY is required");
    }

    const payload = await fetchJson<{
      CITYDATA?: SeoulCityDataPayload;
      RESULT?: SeoulOpenApiResult;
    }>(buildSeoulCityDataUrl(areaName));

    if (payload.CITYDATA) {
      return payload.CITYDATA;
    }

    throw new Error(`citydata: ${payload.RESULT?.MESSAGE ?? "Unknown response"}`);
  },

  async fetchLatestFoodHygieneRows(): Promise<{
    fileName: string;
    rows: Record<string, string>[];
  }> {
    const pageHtml = await fetchText(FOOD_HYGIENE_LIST_URL);
    const matched = /downloadFile\('(\d+)'\);">([^<]+?\.csv)</.exec(pageHtml);

    if (!matched) {
      throw new Error("Could not locate the latest food hygiene CSV download");
    }

    const [, seq, fileName] = matched;
    const formData = new URLSearchParams({
      infId: "OA-13663",
      seq,
      infSeq: "3"
    });

    const csvResponse = await fetch(FOOD_HYGIENE_DOWNLOAD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData.toString()
    });

    if (!csvResponse.ok) {
      throw new Error(`CSV download failed (${csvResponse.status})`);
    }

    const csvContent = new TextDecoder("euc-kr").decode(await csvResponse.arrayBuffer());

    return {
      fileName,
      rows: parseCsv(csvContent)
    };
  }
};
