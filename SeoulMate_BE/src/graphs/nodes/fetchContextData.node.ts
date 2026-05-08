import { mapClient } from "../../clients/map.client";
import { seoulOpenDataClient, type SeoulCityDataPayload } from "../../clients/seoulOpenData.client";
import { livingPopulationRepository } from "../../repositories/livingPopulation.repository";
import {
  getMediumTermForecast,
  getShortTermForecast,
  getUltraShortTermForecast
} from "../../services/weather.service";
import logger from "../../utils/logger";
import type {
  CandidatePlace,
  CongestionLevel,
  RecommendationContextData,
  SeoulMateGraphState,
  SeoulMateGraphUpdate,
  WeatherSource
} from "../recommendation.state";

const SEOUL_CITY_HALL = { latitude: 37.5665, longitude: 126.978 };
const WEATHER_WARNING = "날씨 정보를 가져오는 데 실패하여 날씨 없이 추천을 진행했습니다.";
const CONGESTION_WARNING = "혼잡도 정보를 가져오는 데 실패하여 혼잡도 없이 추천을 진행했습니다.";

const CITYDATA_AREA_BY_REGION: Record<string, string> = {
  성수: "성수카페거리",
  서울숲: "서울숲공원",
  홍대: "홍대 관광특구",
  연남: "연남동",
  합정: "합정역",
  망원: "망원한강공원",
  강남: "강남역",
  신사: "가로수길",
  압구정: "압구정로데오거리",
  잠실: "잠실 관광특구",
  여의도: "여의도",
  익선: "익선동",
  이태원: "이태원 관광특구",
  한남: "한남동",
  을지로: "을지로",
  명동: "명동 관광특구",
  종로: "종각 젊음의 거리",
  혜화: "대학로",
  신촌: "신촌·이대역",
  건대: "건대입구역",
  서촌: "서촌",
  북촌: "북촌한옥마을",
  용산: "용산역",
  마포: "홍대 관광특구",
  성동: "성수카페거리",
  송파: "잠실 관광특구",
  서초: "강남역",
  중구: "명동 관광특구",
  종로구: "광화문·덕수궁",
  강남구: "강남역",
  성동구: "성수카페거리",
  마포구: "홍대 관광특구",
  용산구: "이태원 관광특구"
};

const GU_CODE_BY_NAME: Record<string, string> = {
  종로구: "11110",
  중구: "11140",
  용산구: "11170",
  성동구: "11200",
  광진구: "11215",
  동대문구: "11230",
  중랑구: "11260",
  성북구: "11290",
  강북구: "11305",
  도봉구: "11320",
  노원구: "11350",
  은평구: "11380",
  서대문구: "11410",
  마포구: "11440",
  양천구: "11470",
  강서구: "11500",
  구로구: "11530",
  금천구: "11545",
  영등포구: "11560",
  동작구: "11590",
  관악구: "11620",
  서초구: "11650",
  강남구: "11680",
  송파구: "11710",
  강동구: "11740"
};

const REGION_GU_KEYWORDS: Array<{ districtName: string; keywords: string[] }> = [
  { districtName: "성동구", keywords: ["성수", "서울숲", "성동"] },
  { districtName: "마포구", keywords: ["홍대", "연남", "합정", "망원", "상수", "마포"] },
  { districtName: "서대문구", keywords: ["신촌", "연희", "서대문"] },
  { districtName: "강남구", keywords: ["강남", "신사", "압구정", "청담", "역삼", "선릉"] },
  { districtName: "송파구", keywords: ["잠실", "송파", "석촌", "방이", "송리단길"] },
  { districtName: "영등포구", keywords: ["여의도", "문래", "영등포"] },
  { districtName: "용산구", keywords: ["이태원", "한남", "용산", "경리단"] },
  { districtName: "중구", keywords: ["명동", "을지로", "동대문", "DDP", "청계천"] },
  {
    districtName: "종로구",
    keywords: ["종로", "익선", "북촌", "서촌", "광화문", "혜화", "대학로"]
  },
  { districtName: "광진구", keywords: ["건대", "광진", "어린이대공원"] },
  { districtName: "관악구", keywords: ["샤로수길", "서울대입구", "관악"] },
  { districtName: "서초구", keywords: ["반포", "서초", "양재"] }
];

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

const firstRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (Array.isArray(value)) {
    return value[0] as Record<string, unknown> | undefined;
  }

  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return undefined;
};

const readString = (
  record: Record<string, unknown> | undefined,
  keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value);
    }
  }

  return undefined;
};

const readNumber = (
  record: Record<string, unknown> | undefined,
  keys: string[]
): number | undefined => {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
};

const normalizeCityData = (
  areaName: string,
  payload: SeoulCityDataPayload
): RecommendationContextData["cityData"] => {
  const population = firstRecord(payload.LIVE_PPLTN_STTS);
  const weather = firstRecord(payload.WEATHER_STTS);
  const traffic =
    firstRecord(payload.ROAD_TRAFFIC_STTS) ??
    firstRecord((payload.ROAD_TRAFFIC_STTS as Record<string, unknown> | undefined)?.AVG_ROAD_DATA);

  return {
    areaName: payload.AREA_NM ?? areaName,
    crowdLevel: readString(population, ["AREA_CONGEST_LVL", "AREA_CONGEST_MSG"]),
    weatherStatus: readString(weather, ["WEATHER_STTS", "PRECPT_TYPE", "PCP_MSG"]),
    trafficStatus: readString(traffic, ["ROAD_TRAFFIC_IDX", "ROAD_MSG", "TRAFFIC_STTS"])
  };
};

const resolveCityDataAreaName = (region?: string, places: CandidatePlace[] = []): string => {
  if (region) {
    const matched = Object.entries(CITYDATA_AREA_BY_REGION).find(([keyword]) =>
      region.includes(keyword)
    );

    if (matched) {
      return matched[1];
    }

    return region;
  }

  const placeRegion = places.find((place) => place.region)?.region;
  return placeRegion ? resolveCityDataAreaName(placeRegion) : "명동 관광특구";
};

const getReferenceCoordinate = (
  places: CandidatePlace[]
): { latitude: number; longitude: number } => {
  const place = places.find(
    (item) => typeof item.latitude === "number" && typeof item.longitude === "number"
  );

  return place?.latitude && place.longitude
    ? { latitude: place.latitude, longitude: place.longitude }
    : SEOUL_CITY_HALL;
};

const normalizeRegionText = (value: string): string => value.toLowerCase().replace(/\s+/g, "");

const resolveDistrictNameFromText = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeRegionText(value);
  const direct = Object.keys(GU_CODE_BY_NAME).find((districtName) =>
    normalized.includes(normalizeRegionText(districtName))
  );
  if (direct) {
    return direct;
  }

  return REGION_GU_KEYWORDS.find((entry) =>
    entry.keywords.some((keyword) => normalized.includes(normalizeRegionText(keyword)))
  )?.districtName;
};

const resolveLivingPopulationDistrict = (
  region?: string,
  places: CandidatePlace[] = []
): { districtName: string; guCode: string } | undefined => {
  const candidates = [
    region,
    ...places.flatMap((place) => [place.region, place.address, place.title])
  ];

  for (const candidate of candidates) {
    const districtName = resolveDistrictNameFromText(candidate);
    if (districtName) {
      return {
        districtName,
        guCode: GU_CODE_BY_NAME[districtName]
      };
    }
  }

  return undefined;
};

const getKstDateParts = (value?: string): { dayOfWeek: number; hourCode: number } => {
  const parsed = value ? new Date(value) : new Date();
  const target = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const kst = new Date(target.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();

  return {
    dayOfWeek: day === 0 ? 7 : day,
    hourCode: kst.getUTCHours()
  };
};

const classifyLivingPopulationCongestion = (avgPopulation: number | null): CongestionLevel => {
  if (avgPopulation === null) {
    return "unknown";
  }

  if (avgPopulation < 15000) {
    return "low";
  }

  if (avgPopulation < 30000) {
    return "medium";
  }

  return "high";
};

const chooseWeatherSource = (dateTime?: string): WeatherSource => {
  if (!dateTime) {
    logger.info({ dateTime, diffHours: null }, "[fetchContextData] weather source 분기 계산");
    return "cityData";
  }

  const target = new Date(dateTime);
  if (Number.isNaN(target.getTime())) {
    logger.info({ dateTime, diffHours: null }, "[fetchContextData] weather source 분기 계산");
    return "cityData";
  }

  const diffHours = (target.getTime() - Date.now()) / (60 * 60 * 1000);
  logger.info({ dateTime, diffHours }, "[fetchContextData] weather source 분기 계산");

  if (diffHours <= 0.5) {
    return "cityData";
  }

  if (diffHours <= 6) {
    return "ultraShortTerm";
  }

  if (diffHours <= 24 * 3) {
    return "shortTerm";
  }

  if (diffHours <= 24 * 10) {
    return "mediumTerm";
  }

  return "unavailable";
};

const skyText = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  return (
    {
      "1": "맑음",
      "3": "구름많음",
      "4": "흐림"
    }[value] ?? value
  );
};

const precipitationText = (value?: string): string | undefined => {
  if (!value || value === "0") {
    return undefined;
  }

  return (
    {
      "1": "비",
      "2": "비/눈",
      "3": "눈",
      "4": "소나기",
      "5": "빗방울",
      "6": "빗방울/눈날림",
      "7": "눈날림"
    }[value] ?? value
  );
};

const findClosestForecastGroup = (
  rows: Array<Record<string, string>>,
  targetDateTime?: string
): Record<string, string> => {
  const target = targetDateTime ? new Date(targetDateTime) : new Date();
  const groups = new Map<string, Record<string, string>>();

  for (const row of rows) {
    const date = row.fcstDate ?? row.baseDate;
    const time = row.fcstTime ?? row.baseTime;
    const category = row.category;
    const value = row.fcstValue ?? row.obsrValue;

    if (!date || !time || !category || value === undefined) {
      continue;
    }

    const key = `${date}${time}`;
    const group = groups.get(key) ?? {};
    group[category] = value;
    groups.set(key, group);
  }

  const closest = [...groups.entries()].sort(([leftKey], [rightKey]) => {
    const toDate = (key: string) =>
      new Date(
        `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T${key.slice(8, 10)}:${key.slice(10, 12)}:00+09:00`
      );
    return (
      Math.abs(toDate(leftKey).getTime() - target.getTime()) -
      Math.abs(toDate(rightKey).getTime() - target.getTime())
    );
  })[0];

  return closest?.[1] ?? {};
};

const summarizeUltraShortWeather = (
  rows: Array<Record<string, string>>,
  targetDateTime?: string
): RecommendationContextData["weather"] => {
  const group = findClosestForecastGroup(rows, targetDateTime);
  const precipitation = precipitationText(group.PTY);
  const rainAmount = readNumber(group, ["RN1"]);

  return {
    source: "ultraShortTerm",
    targetDateTime,
    rainProbability: precipitation || (rainAmount ?? 0) > 0 ? 70 : undefined,
    skyStatus: precipitation ?? skyText(group.SKY),
    temperature: readNumber(group, ["T1H"])
  };
};

const summarizeShortWeather = (
  rows: Array<Record<string, string>>,
  targetDateTime?: string
): RecommendationContextData["weather"] => {
  const group = findClosestForecastGroup(rows, targetDateTime);
  const precipitation = precipitationText(group.PTY);

  return {
    source: "shortTerm",
    targetDateTime,
    rainProbability: readNumber(group, ["POP"]),
    skyStatus: precipitation ?? skyText(group.SKY),
    temperature: readNumber(group, ["TMP"])
  };
};

const summarizeCityDataWeather = (
  cityData: RecommendationContextData["cityData"],
  targetDateTime?: string
): RecommendationContextData["weather"] => ({
  source: "cityData",
  targetDateTime,
  skyStatus: cityData?.weatherStatus,
  weatherAlert: cityData ? undefined : "서울 실시간 도시데이터를 조회하지 못했습니다."
});

const buildPlaceDistances = (
  reference: { latitude: number; longitude: number },
  places: CandidatePlace[]
): RecommendationContextData["placeDistances"] =>
  places.reduce<NonNullable<RecommendationContextData["placeDistances"]>>((accumulator, place) => {
    if (typeof place.latitude !== "number" || typeof place.longitude !== "number") {
      return accumulator;
    }

    const distanceMeter = mapClient.calculateDistanceMeter(reference, {
      latitude: place.latitude,
      longitude: place.longitude
    });

    accumulator[place.id] = {
      distanceMeter,
      durationMinute: mapClient.estimateWalkingDurationMinute(distanceMeter),
      provider: "estimated",
      isFallback: true
    };

    return accumulator;
  }, {});

const buildLivingPopulationContext = async (
  region: string | undefined,
  dateTime: string | undefined,
  places: CandidatePlace[]
): Promise<RecommendationContextData["livingPopulation"] | undefined> => {
  const district = resolveLivingPopulationDistrict(region, places);
  if (!district) {
    return undefined;
  }

  const { dayOfWeek, hourCode } = getKstDateParts(dateTime);
  const avgPopulation = await livingPopulationRepository.findAvgByGuCode(
    district.guCode,
    dayOfWeek,
    hourCode
  );

  return {
    source: "livingPopulation",
    guCode: district.guCode,
    districtName: district.districtName,
    dayOfWeek,
    hourCode,
    avgPopulation: avgPopulation ?? undefined,
    congestion: classifyLivingPopulationCongestion(avgPopulation)
  };
};

export const fetchContextDataNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const candidatePlaces = state.candidatePlaces ?? [];
  const areaName = resolveCityDataAreaName(state.parsedRequest?.region, candidatePlaces);
  const referenceCoordinate = getReferenceCoordinate(candidatePlaces);
  const weatherSource = chooseWeatherSource(state.parsedRequest?.dateTime);

  let cityData: RecommendationContextData["cityData"] | undefined;
  if (weatherSource === "cityData") {
    try {
      cityData = normalizeCityData(areaName, await seoulOpenDataClient.fetchCityData(areaName));
    } catch (error) {
      errors.push(`citydata unavailable: ${getErrorMessage(error)}`);
      warnings.push(WEATHER_WARNING);
    }
  }

  let weather: RecommendationContextData["weather"];
  let livingPopulation: RecommendationContextData["livingPopulation"] | undefined;

  try {
    if (weatherSource === "cityData") {
      logger.info("[fetchContextData] weatherSource: cityData");
      weather = summarizeCityDataWeather(cityData, state.parsedRequest?.dateTime);
    } else if (weatherSource === "ultraShortTerm") {
      logger.info("[fetchContextData] weatherSource: ultraShortTerm");
      weather = summarizeUltraShortWeather(
        await getUltraShortTermForecast(
          referenceCoordinate.latitude,
          referenceCoordinate.longitude
        ),
        state.parsedRequest?.dateTime
      );
    } else if (weatherSource === "shortTerm") {
      logger.info("[fetchContextData] weatherSource: shortTerm");
      weather = summarizeShortWeather(
        await getShortTermForecast(referenceCoordinate.latitude, referenceCoordinate.longitude),
        state.parsedRequest?.dateTime
      );
    } else if (weatherSource === "mediumTerm") {
      logger.info("[fetchContextData] weatherSource: mediumTerm");
      const medium = await getMediumTermForecast(state.parsedRequest?.dateTime);
      weather = {
        source: "mediumTerm",
        targetDateTime: state.parsedRequest?.dateTime,
        rainProbability: medium?.rainProbAm ?? medium?.rainProbPm ?? undefined,
        skyStatus: medium?.weatherAm ?? medium?.weatherPm ?? undefined,
        temperature:
          typeof medium?.tempMin === "number" && typeof medium?.tempMax === "number"
            ? Math.round((medium.tempMin + medium.tempMax) / 2)
            : undefined
      };
    } else {
      logger.info("[fetchContextData] weatherSource: unavailable");
      weather = {
        source: "unavailable",
        targetDateTime: state.parsedRequest?.dateTime,
        weatherAlert: "요청 날짜가 11일 이후라 기상청 예보 제공 범위를 벗어납니다."
      };
    }
  } catch (error) {
    errors.push(`weather unavailable: ${getErrorMessage(error)}`);
    warnings.push(WEATHER_WARNING);
    weather = {
      source: weatherSource,
      targetDateTime: state.parsedRequest?.dateTime
    };
  }

  try {
    livingPopulation = await buildLivingPopulationContext(
      state.parsedRequest?.region,
      state.parsedRequest?.dateTime,
      candidatePlaces
    );

    if (livingPopulation?.congestion === "unknown") {
      warnings.push(CONGESTION_WARNING);
    }
  } catch (error) {
    errors.push(`living population unavailable: ${getErrorMessage(error)}`);
    warnings.push(CONGESTION_WARNING);
  }

  return {
    contextData: {
      cityData,
      weather,
      placeDistances: buildPlaceDistances(referenceCoordinate, candidatePlaces),
      livingPopulation
    },
    warnings: [...new Set(warnings)],
    errors
  };
};
