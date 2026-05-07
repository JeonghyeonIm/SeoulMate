import { seoulOpenDataClient, stripHtml } from "../clients/seoulOpenData.client";
import {
  DAILY_PUBLIC_DATA_SYNC_HOUR_KST,
  DAILY_PUBLIC_DATA_SYNC_MINUTE_KST,
  DAILY_PUBLIC_DATA_SYNC_SOURCE,
  DATASET_CATEGORY,
  INITIAL_PUBLIC_DATA_SYNC_SOURCE
} from "../constants/datasetType";
import type { UpsertPublicDatasetInput } from "../models/publicDataset.model";
import { publicDataRepository } from "../repositories/publicData.repository";
import { epsg5174ToWgs84 } from "../utils/coordinates";

interface SyncDatasetResult {
  dataset: string;
  importedCount: number;
}

export interface PublicDataSyncSummary {
  source: string;
  startedAt: string;
  finishedAt: string;
  totalImportedCount: number;
  datasets: SyncDatasetResult[];
  skippedDatasets?: string[];
}

interface VisitSeoulRow {
  POST_SN: string;
  LANG_CODE_ID: string;
  POST_SJ: string;
  POST_URL: string;
  ADDRESS?: string;
  NEW_ADDRESS?: string;
  CMMN_TELNO?: string;
  CMMN_HMPG_URL?: string;
  CMMN_USE_TIME?: string;
  CMMN_BSNDE?: string;
  CMMN_RSTDE?: string;
  SUBWAY_INFO?: string;
  TAG?: string;
  BF_DESC?: string;
  FD_REPRSNT_MENU?: string;
}

interface CulturalEventRow {
  CODENAME: string;
  GUNAME: string;
  TITLE: string;
  PLACE: string;
  ORG_NAME: string;
  USE_TRGT: string;
  USE_FEE: string;
  INQUIRY: string;
  PLAYER: string;
  PROGRAM: string;
  ETC_DESC: string;
  ORG_LINK: string;
  MAIN_IMG: string;
  RGSTDATE: string;
  TICKET: string;
  STRTDATE: string;
  END_DATE: string;
  THEMECODE: string;
  LOT: string;
  LAT: string;
  IS_FREE: string;
  HMPG_ADDR: string;
  PRO_TIME: string;
  DATE: string;
}

interface CulturalSpaceRow {
  NUM: string;
  SUBJCODE: string;
  FAC_NAME: string;
  ADDR: string;
  GNGU: string;
  X_COORD: string;
  Y_COORD: string;
  PHNE: string;
  HOMEPAGE: string;
  OPENHOUR: string;
  ENTR_FEE: string;
  CLOSEDAY: string;
  MAIN_IMG: string;
  ETC_DESC: string;
  FAC_DESC: string;
  ENTRFREE: string;
  SUBWAY: string;
  BUSSTOP: string;
  BLUE: string;
}

interface ParkRow {
  SN: string;
  PARK_NM: string;
  PARK_OTLN: string;
  AREA: string;
  OPEN_YMD: string;
  MAIN_FCLT: string;
  MAIN_PLNT: string;
  VST_ROAD: string;
  UTZTN_REF: string;
  IMG: string;
  RGN: string;
  PARK_ADDR: string;
  MNG_DEPT: string;
  TELNO: string;
  XCRD: string;
  YCRD: string;
  URL: string;
}

interface NightSpotRow {
  NUM: string;
  SUBJECT_CD?: string;
  TITLE: string;
  ADDR?: string;
  LA?: string;
  LO?: string;
  TEL_NO?: string;
  URL?: string;
  OPERATING_TIME?: string;
  FREE_YN?: string;
  ENTR_FEE?: string;
  CONTENTS?: string;
  SUBWAY?: string;
  BUS?: string;
  PARKING_INFO?: string;
}

interface RestPermitRow {
  MGTNO: string;
  APVPERMYMD: string;
  TRDSTATENM: string;
  DTLSTATENM: string;
  DCBYMD: string;
  SITETEL: string;
  SITEAREA: string;
  SITEWHLADDR: string;
  RDNWHLADDR: string;
  BPLCNM: string;
  LASTMODTS: string;
  UPDATEDT: string;
  UPTAENM: string;
  X: string;
  Y: string;
  SNTUPTAENM: string;
  WTRSPLYFACILSENM: string;
  FACILTOTSCP: string;
  HOMEPAGE: string;
}

const FOOD_HYGIENE_LIST_URL =
  "https://data.seoul.go.kr/dataList/datasetView.do?currentPageNo=&infId=OA-13663&searchKey=&searchValue=&serviceKind=1&srvType=F";

const trimToNull = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const parseNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const inferRegion = (address: string | null | undefined): string | null => {
  const normalized = trimToNull(address);
  if (!normalized) {
    return null;
  }

  const matched = normalized.match(/서울(?:특별시)?\s+([^\s]+구)/);
  return matched?.[1] ?? null;
};

const sanitizeTitle = (value: string | null | undefined): string | null => {
  const normalized = trimToNull(value);
  return normalized ? normalized.slice(0, 255) : null;
};

const compact = <T>(items: Array<T | null>): T[] =>
  items.filter((item): item is T => item !== null);

const isActiveBusiness = (row: RestPermitRow): boolean => row.TRDSTATENM.trim().includes("영업");

const toVisitSeoulItems = (
  rows: VisitSeoulRow[],
  sourceDataset: string,
  category: string,
  sourceLabel: string
): UpsertPublicDatasetInput[] =>
  compact(
    rows
      .filter((row) => row.LANG_CODE_ID === "ko")
      .map((row) => {
        const address = trimToNull(row.NEW_ADDRESS) ?? trimToNull(row.ADDRESS);
        const title = sanitizeTitle(row.POST_SJ);

        if (!title) {
          return null;
        }

        return {
          sourceDataset,
          sourceRecordId: row.POST_SN,
          title,
          category,
          region: inferRegion(address),
          address,
          source: sourceLabel,
          sourceUrl: trimToNull(row.POST_URL),
          metadata: {
            sourceLanguage: row.LANG_CODE_ID,
            originalAddress: trimToNull(row.ADDRESS),
            newAddress: trimToNull(row.NEW_ADDRESS),
            phone: trimToNull(row.CMMN_TELNO),
            homepage: trimToNull(row.CMMN_HMPG_URL),
            useTime: trimToNull(row.CMMN_USE_TIME),
            businessDays: trimToNull(row.CMMN_BSNDE),
            closedDays: trimToNull(row.CMMN_RSTDE),
            subwayInfo: trimToNull(row.SUBWAY_INFO),
            tags: trimToNull(row.TAG),
            description: trimToNull(row.BF_DESC),
            representativeMenu: trimToNull(row.FD_REPRSNT_MENU)
          }
        } satisfies UpsertPublicDatasetInput;
      })
  );

const upsertDataset = async (
  dataset: string,
  items: UpsertPublicDatasetInput[]
): Promise<SyncDatasetResult> => {
  await publicDataRepository.upsertMany(items);
  return { dataset, importedCount: items.length };
};

const replaceDataset = async (
  dataset: string,
  sourceDataset: string,
  items: UpsertPublicDatasetInput[]
): Promise<SyncDatasetResult> => {
  await publicDataRepository.replaceDataset(sourceDataset, items);
  return { dataset, importedCount: items.length };
};

const syncVisitSeoulDatasets = async (): Promise<SyncDatasetResult[]> => {
  const [touristFoodRows, touristNatureRows, touristAttractionRows] = await Promise.all([
    seoulOpenDataClient.fetchAllSeoulOpenApiRows<VisitSeoulRow>("TbVwRestaurants"),
    seoulOpenDataClient.fetchAllSeoulOpenApiRows<VisitSeoulRow>("TbVwNature"),
    seoulOpenDataClient.fetchAllSeoulOpenApiRows<VisitSeoulRow>("TbVwAttractions")
  ]);

  return Promise.all([
    upsertDataset(
      DATASET_CATEGORY.TOURIST_FOOD,
      toVisitSeoulItems(
        touristFoodRows,
        "TbVwRestaurants",
        DATASET_CATEGORY.TOURIST_FOOD,
        "visit_seoul_open_api"
      )
    ),
    upsertDataset(
      DATASET_CATEGORY.TOURIST_NATURE,
      toVisitSeoulItems(
        touristNatureRows,
        "TbVwNature",
        DATASET_CATEGORY.TOURIST_NATURE,
        "visit_seoul_open_api"
      )
    ),
    upsertDataset(
      DATASET_CATEGORY.TOURIST_ATTRACTION,
      toVisitSeoulItems(
        touristAttractionRows,
        "TbVwAttractions",
        DATASET_CATEGORY.TOURIST_ATTRACTION,
        "visit_seoul_open_api"
      )
    )
  ]);
};

const syncCulturalEventDataset = async (): Promise<SyncDatasetResult> => {
  const rows =
    await seoulOpenDataClient.fetchAllSeoulOpenApiRows<CulturalEventRow>("culturalEventInfo");

  const items = compact(
    rows.map((row) => {
      const title = sanitizeTitle(row.TITLE);
      if (!title) {
        return null;
      }

      return {
        sourceDataset: "culturalEventInfo",
        sourceRecordId: trimToNull(row.HMPG_ADDR) ?? `${title}-${row.STRTDATE}`,
        title,
        category: DATASET_CATEGORY.CULTURAL_EVENT,
        region: trimToNull(row.GUNAME),
        address: trimToNull(row.PLACE),
        latitude: parseNumber(row.LAT),
        longitude: parseNumber(row.LOT),
        source: "seoul_open_api",
        sourceUrl: trimToNull(row.HMPG_ADDR) ?? trimToNull(row.ORG_LINK),
        metadata: {
          codeName: trimToNull(row.CODENAME),
          organization: trimToNull(row.ORG_NAME),
          useTarget: trimToNull(row.USE_TRGT),
          useFee: trimToNull(row.USE_FEE),
          inquiry: trimToNull(row.INQUIRY),
          player: trimToNull(row.PLAYER),
          program: trimToNull(row.PROGRAM),
          description: trimToNull(row.ETC_DESC),
          homepage: trimToNull(row.ORG_LINK),
          mainImage: trimToNull(row.MAIN_IMG),
          registeredDate: trimToNull(row.RGSTDATE),
          ticketType: trimToNull(row.TICKET),
          startDate: trimToNull(row.STRTDATE),
          endDate: trimToNull(row.END_DATE),
          themeCode: trimToNull(row.THEMECODE),
          freeYn: trimToNull(row.IS_FREE),
          operatingTime: trimToNull(row.PRO_TIME),
          displayDate: trimToNull(row.DATE)
        }
      } satisfies UpsertPublicDatasetInput;
    })
  );

  return replaceDataset(DATASET_CATEGORY.CULTURAL_EVENT, "culturalEventInfo", items);
};

const syncCulturalSpaceDataset = async (): Promise<SyncDatasetResult> => {
  const rows =
    await seoulOpenDataClient.fetchAllSeoulOpenApiRows<CulturalSpaceRow>("culturalSpaceInfo");

  const items = compact(
    rows.map((row) => {
      const title = sanitizeTitle(row.FAC_NAME);
      if (!title) {
        return null;
      }

      return {
        sourceDataset: "culturalSpaceInfo",
        sourceRecordId: row.NUM,
        title,
        category: DATASET_CATEGORY.CULTURAL_SPACE,
        region: trimToNull(row.GNGU),
        address: trimToNull(row.ADDR),
        latitude: parseNumber(row.X_COORD),
        longitude: parseNumber(row.Y_COORD),
        source: "seoul_open_api",
        sourceUrl: trimToNull(row.HOMEPAGE),
        metadata: {
          subjectCode: trimToNull(row.SUBJCODE),
          phone: trimToNull(row.PHNE),
          openHour: trimToNull(row.OPENHOUR),
          entranceFee: trimToNull(row.ENTR_FEE),
          closedDay: trimToNull(row.CLOSEDAY),
          mainImage: trimToNull(row.MAIN_IMG),
          etcDescription: trimToNull(row.ETC_DESC),
          facilityDescription: trimToNull(row.FAC_DESC),
          entranceFree: trimToNull(row.ENTRFREE),
          subway: trimToNull(row.SUBWAY),
          busStop: trimToNull(row.BUSSTOP),
          blueBus: trimToNull(row.BLUE)
        }
      } satisfies UpsertPublicDatasetInput;
    })
  );

  return upsertDataset(DATASET_CATEGORY.CULTURAL_SPACE, items);
};

const syncParkDataset = async (): Promise<SyncDatasetResult> => {
  const rows = await seoulOpenDataClient.fetchAllSeoulOpenApiRows<ParkRow>("SearchParkInfoService");

  const items = compact(
    rows.map((row) => {
      const title = sanitizeTitle(row.PARK_NM);
      if (!title) {
        return null;
      }

      return {
        sourceDataset: "SearchParkInfoService",
        sourceRecordId: row.SN,
        title,
        category: DATASET_CATEGORY.MAJOR_PARK,
        region: trimToNull(row.RGN),
        address: trimToNull(row.PARK_ADDR),
        latitude: parseNumber(row.YCRD),
        longitude: parseNumber(row.XCRD),
        source: "seoul_open_api",
        sourceUrl: trimToNull(row.URL),
        metadata: {
          outline: trimToNull(row.PARK_OTLN),
          area: trimToNull(row.AREA),
          openDate: trimToNull(row.OPEN_YMD),
          mainFacility: trimToNull(row.MAIN_FCLT),
          mainPlant: trimToNull(row.MAIN_PLNT),
          visitRoad: trimToNull(row.VST_ROAD),
          usageReference: trimToNull(row.UTZTN_REF),
          image: trimToNull(row.IMG),
          managingDepartment: trimToNull(row.MNG_DEPT),
          phone: trimToNull(row.TELNO)
        }
      } satisfies UpsertPublicDatasetInput;
    })
  );

  return upsertDataset(DATASET_CATEGORY.MAJOR_PARK, items);
};

const syncRestAreaPermitDataset = async (): Promise<SyncDatasetResult> => {
  const rows =
    await seoulOpenDataClient.fetchAllSeoulOpenApiRows<RestPermitRow>("LOCALDATA_072405");

  const items = compact(
    rows.filter(isActiveBusiness).map((row) => {
      const title = sanitizeTitle(row.BPLCNM);
      if (!title) {
        return null;
      }

      const address = trimToNull(row.RDNWHLADDR) ?? trimToNull(row.SITEWHLADDR);
      const x5174 = parseNumber(row.X);
      const y5174 = parseNumber(row.Y);
      const wgs84 = x5174 !== null && y5174 !== null ? epsg5174ToWgs84(x5174, y5174) : null;
      return {
        sourceDataset: "LOCALDATA_072405",
        sourceRecordId: row.MGTNO,
        title,
        category: DATASET_CATEGORY.REST_AREA_PERMIT,
        region: inferRegion(address),
        address,
        latitude: wgs84?.lat ?? null,
        longitude: wgs84?.lng ?? null,
        source: "seoul_open_api",
        sourceUrl: trimToNull(row.HOMEPAGE),
        metadata: {
          approvalDate: trimToNull(row.APVPERMYMD),
          tradeState: trimToNull(row.TRDSTATENM),
          detailState: trimToNull(row.DTLSTATENM),
          closeDate: trimToNull(row.DCBYMD),
          phone: trimToNull(row.SITETEL),
          siteArea: trimToNull(row.SITEAREA),
          lastModifiedAt: trimToNull(row.LASTMODTS),
          updatedAt: trimToNull(row.UPDATEDT),
          businessType: trimToNull(row.UPTAENM),
          sanitizedBusinessType: trimToNull(row.SNTUPTAENM),
          coordinateX5174: trimToNull(row.X),
          coordinateY5174: trimToNull(row.Y),
          waterSupplyFacility: trimToNull(row.WTRSPLYFACILSENM),
          totalFacilityScale: trimToNull(row.FACILTOTSCP)
        }
      } satisfies UpsertPublicDatasetInput;
    })
  );

  return replaceDataset(DATASET_CATEGORY.REST_AREA_PERMIT, "LOCALDATA_072405", items);
};

const syncGeneralRestaurantDataset = async (): Promise<SyncDatasetResult> => {
  const rows =
    await seoulOpenDataClient.fetchAllSeoulOpenApiRows<RestPermitRow>("LOCALDATA_072404");

  const items = compact(
    rows.filter(isActiveBusiness).map((row) => {
      const title = sanitizeTitle(row.BPLCNM);
      if (!title) {
        return null;
      }

      const address = trimToNull(row.RDNWHLADDR) ?? trimToNull(row.SITEWHLADDR);
      const x5174 = parseNumber(row.X);
      const y5174 = parseNumber(row.Y);
      const wgs84 = x5174 !== null && y5174 !== null ? epsg5174ToWgs84(x5174, y5174) : null;
      return {
        sourceDataset: "LOCALDATA_072404",
        sourceRecordId: row.MGTNO,
        title,
        category: DATASET_CATEGORY.GENERAL_RESTAURANT_PERMIT,
        region: inferRegion(address),
        address,
        latitude: wgs84?.lat ?? null,
        longitude: wgs84?.lng ?? null,
        source: "seoul_open_api",
        sourceUrl: trimToNull(row.HOMEPAGE),
        metadata: {
          approvalDate: trimToNull(row.APVPERMYMD),
          tradeState: trimToNull(row.TRDSTATENM),
          detailState: trimToNull(row.DTLSTATENM),
          closeDate: trimToNull(row.DCBYMD),
          phone: trimToNull(row.SITETEL),
          siteArea: trimToNull(row.SITEAREA),
          lastModifiedAt: trimToNull(row.LASTMODTS),
          updatedAt: trimToNull(row.UPDATEDT),
          businessType: trimToNull(row.UPTAENM),
          sanitizedBusinessType: trimToNull(row.SNTUPTAENM),
          coordinateX5174: trimToNull(row.X),
          coordinateY5174: trimToNull(row.Y),
          waterSupplyFacility: trimToNull(row.WTRSPLYFACILSENM),
          totalFacilityScale: trimToNull(row.FACILTOTSCP)
        }
      } satisfies UpsertPublicDatasetInput;
    })
  );

  return replaceDataset(DATASET_CATEGORY.GENERAL_RESTAURANT_PERMIT, "LOCALDATA_072404", items);
};

const syncFoodHygieneDataset = async (): Promise<SyncDatasetResult> => {
  const { fileName, rows } = await seoulOpenDataClient.fetchLatestFoodHygieneRows();
  const PERMIT_COVERED_TYPES = new Set(["일반음식점", "휴게음식점"]);

  const items = compact(
    rows
      .filter((row) => !trimToNull(row["폐업일자"]))
      .filter((row) => !PERMIT_COVERED_TYPES.has(row["업종명"]?.trim()))
      .map((row) => {
        const title = sanitizeTitle(row["업소명"]);
        if (!title) {
          return null;
        }

        const address = trimToNull(row["소재지도로명"]) ?? trimToNull(row["소재지지번"]);

        return {
          sourceDataset: "OA-13663",
          sourceRecordId: `${row["시군구코드"]}-${row["업종코드"]}-${row["년도"]}-${row["업소일련번호"]}`,
          title,
          category: DATASET_CATEGORY.FOOD_HYGIENE,
          region: inferRegion(address),
          address,
          source: "seoul_file_data",
          sourceUrl: FOOD_HYGIENE_LIST_URL,
          metadata: {
            fileName,
            districtCode: trimToNull(row["시군구코드"]),
            businessCode: trimToNull(row["업종코드"]),
            year: trimToNull(row["년도"]),
            serialNumber: trimToNull(row["업소일련번호"]),
            businessType: trimToNull(row["업종명"]),
            permitDate: trimToNull(row["허가신고일"]),
            landAddress: trimToNull(row["소재지지번"]),
            roadAddress: trimToNull(row["소재지도로명"]),
            businessAreaSquareMeter: trimToNull(row["영업장면적(㎡)"]),
            administrativeDong: trimToNull(row["행정동명"]),
            businessStatusName: trimToNull(row["업태명"]),
            waterSupply: trimToNull(row["급수시설"]),
            locationType: trimToNull(row["업소위치"]),
            exemplaryRestaurantYn: trimToNull(row["모범음식점여부"]),
            domesticOrForeign: trimToNull(row["내외국인구분"]),
            nationality: trimToNull(row["국적"])
          }
        } satisfies UpsertPublicDatasetInput;
      })
  );

  return replaceDataset(DATASET_CATEGORY.FOOD_HYGIENE, "OA-13663", items);
};

const syncNightSpotDataset = async (): Promise<SyncDatasetResult> => {
  const rows = await seoulOpenDataClient.fetchAllSeoulOpenApiRows<NightSpotRow>("viewNightSpot");

  const items = compact(
    rows.map((row) => {
      const title = sanitizeTitle(row.TITLE);
      if (!title) {
        return null;
      }

      const address = trimToNull(row.ADDR);
      const rawContents = trimToNull(row.CONTENTS);

      return {
        sourceDataset: "viewNightSpot",
        sourceRecordId: String(row.NUM),
        title,
        category: DATASET_CATEGORY.NIGHT_SPOT,
        region: inferRegion(address),
        address,
        latitude: parseNumber(row.LA),
        longitude: parseNumber(row.LO),
        source: "seoul_open_api",
        sourceUrl: trimToNull(row.URL),
        metadata: {
          subjectCode: trimToNull(row.SUBJECT_CD),
          phone: trimToNull(row.TEL_NO),
          operatingTime: trimToNull(row.OPERATING_TIME),
          freeYn: trimToNull(row.FREE_YN),
          entranceFee: trimToNull(row.ENTR_FEE),
          description: rawContents ? stripHtml(rawContents) : null,
          subway: trimToNull(row.SUBWAY),
          bus: trimToNull(row.BUS),
          parkingInfo: trimToNull(row.PARKING_INFO)
        }
      } satisfies UpsertPublicDatasetInput;
    })
  );

  return upsertDataset(DATASET_CATEGORY.NIGHT_SPOT, items);
};

export const syncDailyPublicData = async (): Promise<PublicDataSyncSummary> => {
  const run = await publicDataRepository.beginSyncRun(DAILY_PUBLIC_DATA_SYNC_SOURCE);
  const startedAt = new Date().toISOString();

  try {
    const datasets: SyncDatasetResult[] = [];
    datasets.push(await syncCulturalSpaceDataset());
    datasets.push(await syncCulturalEventDataset());

    const totalImportedCount = datasets.reduce((sum, dataset) => sum + dataset.importedCount, 0);
    await publicDataRepository.completeSyncRun(run.id, totalImportedCount, 0);

    return {
      source: DAILY_PUBLIC_DATA_SYNC_SOURCE,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalImportedCount,
      datasets
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await publicDataRepository.failSyncRun(run.id, message);
    throw error;
  }
};

export const syncNonRealtimePublicData = async (): Promise<PublicDataSyncSummary> => {
  const run = await publicDataRepository.beginSyncRun(INITIAL_PUBLIC_DATA_SYNC_SOURCE);
  const startedAt = new Date().toISOString();

  try {
    const datasets: SyncDatasetResult[] = [];
    datasets.push(...(await syncVisitSeoulDatasets()));
    datasets.push(await syncParkDataset());
    datasets.push(await syncCulturalSpaceDataset());
    datasets.push(await syncCulturalEventDataset());
    datasets.push(await syncRestAreaPermitDataset());
    datasets.push(await syncGeneralRestaurantDataset());
    datasets.push(await syncFoodHygieneDataset());
    datasets.push(await syncNightSpotDataset());

    const totalImportedCount = datasets.reduce((sum, dataset) => sum + dataset.importedCount, 0);

    await publicDataRepository.completeSyncRun(run.id, totalImportedCount, 0);

    return {
      source: INITIAL_PUBLIC_DATA_SYNC_SOURCE,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalImportedCount,
      datasets
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await publicDataRepository.failSyncRun(run.id, message);
    throw error;
  }
};

let dailySyncTimer: NodeJS.Timeout | null = null;

const getDelayUntilNextDailySync = (): number => {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const shiftedNow = new Date(Date.now() + kstOffsetMs);
  const nextShifted = new Date(shiftedNow);

  nextShifted.setUTCHours(DAILY_PUBLIC_DATA_SYNC_HOUR_KST, DAILY_PUBLIC_DATA_SYNC_MINUTE_KST, 0, 0);

  if (nextShifted.getTime() <= shiftedNow.getTime()) {
    nextShifted.setUTCDate(nextShifted.getUTCDate() + 1);
  }

  return nextShifted.getTime() - shiftedNow.getTime();
};

export const scheduleDailyPublicDataSync = (): void => {
  const scheduleNext = () => {
    dailySyncTimer = setTimeout(async () => {
      try {
        await syncDailyPublicData();
      } catch (error) {
        console.error("Daily public data sync failed", error);
      } finally {
        scheduleNext();
      }
    }, getDelayUntilNextDailySync());
  };

  if (dailySyncTimer) {
    clearTimeout(dailySyncTimer);
  }

  scheduleNext();
};
