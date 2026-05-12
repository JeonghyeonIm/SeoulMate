import type { PublicDataset } from "../../models/publicDataset.model";
import { publicDataRepository } from "../../repositories/publicData.repository";
import { isValidSeoulCoordinate } from "../../utils/coordinates";
import type {
  CandidatePlace,
  ParsedRecommendationRequest,
  SeoulMateGraphState,
  SeoulMateGraphUpdate
} from "../recommendation.state";

const DEFAULT_SOURCE_DATASETS = [
  "culturalEventInfo",
  "culturalSpaceInfo",
  "TbVwRestaurants",
  "TbVwNature",
  "TbVwAttractions",
  "SearchParkInfoService",
  "LOCALDATA_072404",
  "LOCALDATA_072405",
  "viewNightSpot"
];

const REQUESTED_SPECIAL_CATEGORY_KEYWORDS = [
  "\ucea0\ud551",
  "\ucea0\ud551\uc7a5",
  "\uc57c\uc601",
  "\uae00\ub7a8\ud551",
  "\ub180\uc774\uc2dc\uc124",
  "\ub180\uc774\uacf5\uc6d0",
  "\ud14c\ub9c8\ud30c\ud06c",
  "\uc5b4\ud2b8\ub799\uc158",
  "\uc6cc\ud130\ud30c\ud06c"
];

const CATEGORY_KEYWORD_ALIASES: Array<{
  triggers: string[];
  aliases: string[];
}> = [
  {
    triggers: [
      "\uc220\uc9d1",
      "2\ucc28",
      "\ud638\ud504\uc9d1",
      "\uc8fc\uc810",
      "\ud074\ub7fd",
      "\ub098\uc774\ud2b8",
      "\uac10\uc131\uc8fc\uc810",
      "\ud38d",
      "\ud558\uc774\ubcfc",
      "\ub9c9\uac78\ub9ac",
      "\ub9c9\uac78\ub9ac\uc9d1",
      "\uc804\ud1b5\uc8fc\uc810",
      "\ub8e8\ud504\ud0d1\ubc14",
      "lp\ubc14",
      "\uc5d8\ud53c\ubc14",
      "\uc7ac\uc988\ubc14",
      "\uc640\uc778\ubc14",
      "\uce75\ud14c\uc77c\ubc14"
    ],
    aliases: [
      "\uc220\uc9d1",
      "2\ucc28",
      "\ud638\ud504\uc9d1",
      "\uc8fc\uc810",
      "\ud638\ud504",
      "\ud3ec\ucc28",
      "\ub9e5\uc8fc",
      "\uc640\uc778",
      "\uce75\ud14c\uc77c",
      "\uc774\uc790\uce74\uc57c",
      "\ud38d",
      "\ud558\uc774\ubcfc",
      "\ub9c9\uac78\ub9ac",
      "\ub9c9\uac78\ub9ac\uc9d1",
      "\uc804\ud1b5\uc8fc\uc810",
      "\ub8e8\ud504\ud0d1\ubc14",
      "\ud63c\uc220",
      "\uac10\uc131\uc8fc\uc810",
      "\uc815\uc885/\ub300\ud3ec\uc9d1/\uc18c\uc8fc\ubc29",
      "\ud638\ud504/\ud1b5\ub2ed",
      "lp\ubc14",
      "\uc5d8\ud53c\ubc14",
      "lp bar",
      "\uc7ac\uc988\ubc14",
      "jazz bar",
      "\uc640\uc778\ubc14",
      "wine bar",
      "\uce75\ud14c\uc77c\ubc14",
      "cocktail bar",
      "club",
      "bar",
      "pub"
    ]
  },
  {
    triggers: ["\uce58\ud0a8", "\ud1b5\ub2ed", "\ud53c\uc790", "\ud53c\uc790\uc9d1"],
    aliases: [
      "\uce58\ud0a8",
      "\ud1b5\ub2ed",
      "\ud638\ud504/\ud1b5\ub2ed",
      "\ud53c\uc790",
      "\ud53c\uc790\uc9d1",
      "chicken",
      "pizza"
    ]
  },
  {
    triggers: [
      "\ub178\ub798\ubc29",
      "\ub178\ub798\uc5f0\uc2b5\uc7a5",
      "\ucf54\uc778\ub178\ub798\ubc29"
    ],
    aliases: [
      "\ub178\ub798\ubc29",
      "\ub178\ub798\uc5f0\uc2b5\uc7a5",
      "\ucf54\uc778\ub178\ub798\ubc29",
      "\ub3d9\uc804\ub178\ub798\uc5f0\uc2b5\uc7a5",
      "karaoke"
    ]
  },
  {
    triggers: [
      "\uc2e4\ub0b4\ub180\uac70\ub9ac",
      "\ubc29\ud0c8\ucd9c",
      "\ubcf4\ub4dc\uac8c\uc784",
      "\ucc1c\uc9c8\ubc29",
      "\ubcfc\ub9c1",
      "\ub2f9\uad6c",
      "\ub9cc\ud654\uce74\ud398",
      "\uacf5\ubc29",
      "\uc6d0\ub370\uc774\ud074\ub798\uc2a4",
      "\ud5a5\uc218",
      "\ub3c4\uc790\uae30",
      "\ud074\ub77c\uc774\ubc0d",
      "\uc544\ucf00\uc774\ub4dc",
      "\uc561\ud2f0\ube44\ud2f0",
      "\uccb4\ud5d8"
    ],
    aliases: [
      "\ubc29\ud0c8\ucd9c",
      "\ubcf4\ub4dc\uac8c\uc784",
      "\ubcf4\ub4dc\uac8c\uc784\uce74\ud398",
      "\ucc1c\uc9c8\ubc29",
      "\ubcfc\ub9c1",
      "\ub2f9\uad6c",
      "\ub2f9\uad6c\uc7a5",
      "\ub9cc\ud654\uce74\ud398",
      "\uacf5\ubc29",
      "\uc6d0\ub370\uc774\ud074\ub798\uc2a4",
      "\ud5a5\uc218",
      "\ub3c4\uc790\uae30",
      "\ud074\ub77c\uc774\ubc0d",
      "VR",
      "vr",
      "\uc544\ucf00\uc774\ub4dc",
      "\ubcf5\ud569\uc720\ud1b5\uac8c\uc784\uc81c\uacf5\uc5c5",
      "\uccb4\ub825\ub2e8\ub828\uc7a5\uc5c5"
    ]
  },
  {
    triggers: [
      "\ucea0\ud551",
      "\ucea0\ud551\uc7a5",
      "\uc57c\uc601",
      "\uae00\ub7a8\ud551",
      "\ubc14\ubca0\ud050",
      "\ud53c\ud06c\ub2c9\uc7a5"
    ],
    aliases: [
      "\ucea0\ud551",
      "\ucea0\ud551\uc7a5",
      "\uc57c\uc601",
      "\uae00\ub7a8\ud551",
      "\ubc14\ubca0\ud050",
      "\ud53c\ud06c\ub2c9\uc7a5",
      "\ud53c\ud06c\ub2c9"
    ]
  },
  {
    triggers: [
      "\ub180\uc774\uc2dc\uc124",
      "\ub180\uc774\uacf5\uc6d0",
      "\ud14c\ub9c8\ud30c\ud06c",
      "\uc5b4\ud2b8\ub799\uc158",
      "\uc6cc\ud130\ud30c\ud06c"
    ],
    aliases: [
      "\ub180\uc774\uc2dc\uc124",
      "\ub180\uc774\uacf5\uc6d0",
      "\ud14c\ub9c8\ud30c\ud06c",
      "\uc5b4\ud2b8\ub799\uc158",
      "\uc6cc\ud130\ud30c\ud06c",
      "\uc5b4\ub4dc\ubca4\ucc98",
      "\ub86f\ub370\uc6d4\ub4dc",
      "\uc5b4\ub9b0\uc774\ub300\uacf5\uc6d0",
      "\ud5c8\uac00\ud14c\ub9c8\ud30c\ud06c\uc5c5"
    ]
  }
];

const AMUSEMENT_REGION_HINTS = [
  "\uc7a0\uc2e4",
  "\uc1a1\ud30c",
  "\ub86f\ub370\uc6d4\ub4dc",
  "\uc5b4\ub9b0\uc774\ub300\uacf5\uc6d0",
  "\ub2a5\ub3d9",
  "\uad11\uc9c4",
  "\ubb38\uc815",
  "\ud30c\ud06c\ud558\ube44\uc624",
  "\uc6cc\ud130\ud0b9\ub364"
];

const CATEGORY_SOURCE_DATASETS: Array<{
  keywords: string[];
  sourceDatasets: string[];
}> = [
  {
    keywords: ["카페", "커피", "디저트"],
    sourceDatasets: ["TbVwRestaurants", "LOCALDATA_072404", "LOCALDATA_072405"]
  },
  {
    keywords: ["음식", "식사", "맛집", "식당", "레스토랑"],
    sourceDatasets: ["TbVwRestaurants", "LOCALDATA_072404", "LOCALDATA_072405"]
  },
  {
    keywords: ["문화", "전시", "공연", "공간", "박물관"],
    sourceDatasets: ["culturalEventInfo", "culturalSpaceInfo", "TbVwAttractions"]
  },
  {
    keywords: ["산책", "공원", "자연", "야외", "숲"],
    sourceDatasets: ["SearchParkInfoService", "TbVwNature"]
  },
  {
    keywords: ["관광", "명소", "야경"],
    sourceDatasets: ["TbVwAttractions", "viewNightSpot", "TbVwNature"]
  }
];

interface RegionProfile {
  keywords: string[];
  districts: string[];
  aliases: string[];
}

interface RegionResolution {
  isSupported: boolean;
  districts: string[];
  aliases: string[];
  error?: string;
}

const SEOUL_DISTRICTS = [
  "강남구",
  "강동구",
  "강북구",
  "강서구",
  "관악구",
  "광진구",
  "구로구",
  "금천구",
  "노원구",
  "도봉구",
  "동대문구",
  "동작구",
  "마포구",
  "서대문구",
  "서초구",
  "성동구",
  "성북구",
  "송파구",
  "양천구",
  "영등포구",
  "용산구",
  "은평구",
  "종로구",
  "중구",
  "중랑구"
];

const REGION_PROFILES: RegionProfile[] = [
  {
    keywords: ["성수", "성수동"],
    districts: ["성동구"],
    aliases: ["성수", "성수동", "서울숲", "뚝섬"]
  },
  {
    keywords: ["왕십리", "한양대", "행당"],
    districts: ["성동구"],
    aliases: ["왕십리", "왕십리역", "한양대", "한양대역", "행당", "행당동", "상왕십리"]
  },
  {
    keywords: ["서울숲", "뚝섬"],
    districts: ["성동구"],
    aliases: ["서울숲", "뚝섬", "성수"]
  },
  {
    keywords: ["홍대", "홍익대", "홍대입구"],
    districts: ["마포구"],
    aliases: ["홍대", "홍익", "서교", "동교", "연남", "상수", "합정"]
  },
  {
    keywords: ["연남"],
    districts: ["마포구"],
    aliases: ["연남", "동교", "홍대"]
  },
  {
    keywords: ["합정", "상수", "망원"],
    districts: ["마포구"],
    aliases: ["합정", "상수", "망원", "홍대"]
  },
  {
    keywords: ["강남역"],
    districts: ["강남구", "서초구"],
    aliases: ["강남역", "역삼", "서초"]
  },
  {
    keywords: ["강남", "역삼", "삼성", "논현", "신사", "압구정", "청담"],
    districts: ["강남구"],
    aliases: ["강남", "역삼", "삼성", "논현", "신사", "압구정", "청담", "가로수길"]
  },
  {
    keywords: ["잠실", "석촌", "방이", "송리단길"],
    districts: ["송파구"],
    aliases: ["잠실", "석촌", "방이", "송파", "송리단길"]
  },
  {
    keywords: ["여의도", "여의나루", "문래"],
    districts: ["영등포구"],
    aliases: ["여의도", "여의나루", "문래", "영등포"]
  },
  {
    keywords: ["이태원", "한남", "해방촌", "경리단", "용산"],
    districts: ["용산구"],
    aliases: ["이태원", "한남", "해방촌", "경리단", "용산"]
  },
  {
    keywords: ["명동", "을지로", "청계천", "동대문", "ddp", "DDP"],
    districts: ["중구"],
    aliases: ["명동", "을지로", "청계천", "동대문", "DDP"]
  },
  {
    keywords: ["종로", "익선", "북촌", "서촌", "광화문", "혜화", "대학로", "인사동"],
    districts: ["종로구"],
    aliases: ["종로", "익선", "북촌", "서촌", "광화문", "혜화", "대학로", "인사동"]
  },
  {
    keywords: ["건대", "건대입구", "어린이대공원"],
    districts: ["광진구"],
    aliases: ["건대", "건대입구", "어린이대공원", "광진"]
  },
  {
    keywords: ["신촌", "이대", "연희"],
    districts: ["서대문구", "마포구"],
    aliases: ["신촌", "이대", "연희"]
  },
  {
    keywords: ["샤로수길", "서울대입구", "관악"],
    districts: ["관악구"],
    aliases: ["샤로수길", "서울대입구", "관악"]
  },
  {
    keywords: ["반포", "서초", "양재"],
    districts: ["서초구"],
    aliases: ["반포", "서초", "양재"]
  },
  {
    keywords: ["천호", "암사", "길동", "둔촌", "명일", "고덕", "상일", "강동"],
    districts: ["강동구"],
    aliases: ["천호", "암사", "길동", "둔촌", "명일", "고덕", "상일", "강동"]
  },
  {
    keywords: ["미아", "수유", "번동", "우이", "강북"],
    districts: ["강북구"],
    aliases: ["미아", "수유", "번동", "우이", "북서울꿈의숲", "강북"]
  },
  {
    keywords: [
      "마곡",
      "발산",
      "우장산",
      "화곡",
      "가양",
      "등촌",
      "개화",
      "방화",
      "김포공항",
      "강서"
    ],
    districts: ["강서구"],
    aliases: ["마곡", "발산", "우장산", "화곡", "가양", "등촌", "개화", "방화", "김포공항", "강서"]
  },
  {
    keywords: ["구디", "구로디지털단지", "신도림", "고척", "개봉", "오류", "구로"],
    districts: ["구로구"],
    aliases: ["구디", "구로디지털단지", "신도림", "고척", "개봉", "오류", "구로"]
  },
  {
    keywords: ["가산", "가산디지털단지", "독산", "시흥", "금천"],
    districts: ["금천구"],
    aliases: ["가산", "가산디지털단지", "독산", "시흥", "금천"]
  },
  {
    keywords: ["공릉", "태릉", "하계", "중계", "상계", "노원", "월계", "광운대"],
    districts: ["노원구"],
    aliases: ["공릉", "태릉", "하계", "중계", "상계", "노원", "월계", "광운대"]
  },
  {
    keywords: ["창동", "쌍문", "방학", "도봉", "도봉산"],
    districts: ["도봉구"],
    aliases: ["창동", "쌍문", "방학", "도봉", "도봉산"]
  },
  {
    keywords: ["청량리", "회기", "외대앞", "경희대", "답십리", "장안", "전농", "제기", "동대문구"],
    districts: ["동대문구"],
    aliases: ["청량리", "회기", "외대앞", "경희대", "답십리", "장안", "전농", "제기", "동대문구"]
  },
  {
    keywords: ["사당", "이수", "노량진", "흑석", "상도", "신대방", "동작"],
    districts: ["동작구"],
    aliases: ["사당", "이수", "노량진", "흑석", "상도", "신대방", "동작"]
  },
  {
    keywords: ["성신여대", "안암", "고려대", "길음", "정릉", "돈암", "월곡", "석계", "성북"],
    districts: ["성북구"],
    aliases: ["성신여대", "안암", "고려대", "길음", "정릉", "돈암", "월곡", "석계", "성북"]
  },
  {
    keywords: ["목동", "오목교", "신정", "신월", "양천"],
    districts: ["양천구"],
    aliases: ["목동", "오목교", "신정", "신월", "양천"]
  },
  {
    keywords: ["불광", "연신내", "구파발", "응암", "새절", "녹번", "은평", "진관"],
    districts: ["은평구"],
    aliases: ["불광", "연신내", "구파발", "응암", "새절", "녹번", "은평", "진관"]
  },
  {
    keywords: ["상봉", "망우", "면목", "사가정", "먹골", "중화", "중랑"],
    districts: ["중랑구"],
    aliases: ["상봉", "망우", "면목", "사가정", "먹골", "중화", "중랑"]
  }
];

const SEOUL_WIDE_REGIONS = ["서울", "서울시", "서울특별시"];
const NON_SEOUL_REGIONS = [
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주"
];

const extractText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const parseCost = (value: unknown): number | undefined => {
  const text = extractText(value);

  if (!text) {
    return undefined;
  }

  if (/무료|free|없음|0\s*원/i.test(text)) {
    return 0;
  }

  const won = text.match(/(\d[\d,]*)\s*원/);
  if (won) {
    return Number(won[1].replace(/,/g, ""));
  }

  const numberOnly = text.match(/\b(\d{4,6})\b/);
  return numberOnly ? Number(numberOnly[1]) : undefined;
};

const estimateCost = (item: PublicDataset): number | undefined => {
  const metadata = item.metadata ?? {};
  return (
    parseCost(metadata.useFee) ??
    parseCost(metadata.entranceFee) ??
    parseCost(metadata.entrFee) ??
    parseCost(metadata.freeYn) ??
    parseCost(metadata.entranceFree)
  );
};

const extractTags = (metadata: Record<string, unknown>): string[] => {
  const tags = extractText(metadata.tags);
  return tags
    .split(/[#,/\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
};

const mapCandidate = (item: PublicDataset): CandidatePlace => ({
  id: item.id,
  title: item.title,
  category: item.category,
  placeFamily: item.placeFamily ?? undefined,
  placeType: item.placeType ?? undefined,
  placeSubtype: item.placeSubtype ?? undefined,
  kakaoCategoryName: item.kakaoCategoryName ?? undefined,
  kakaoCategoryGroupName: item.kakaoCategoryGroupName ?? undefined,
  region: item.region ?? undefined,
  address: item.address ?? undefined,
  latitude: item.latitude ?? undefined,
  longitude: item.longitude ?? undefined,
  estimatedCost: item.menuPriceFirst ?? estimateCost(item),
  menuPriceFirst: item.menuPriceFirst ?? undefined,
  menuNameFirst: item.menuNameFirst ?? undefined,
  tags: extractTags(item.metadata),
  sourceDataset: item.sourceDataset ?? undefined,
  source: item.source ?? undefined,
  sourceUrl: item.sourceUrl ?? undefined,
  mapUrl: item.kakaoPlaceUrl ?? item.sourceUrl ?? undefined,
  metadata: item.metadata
});

const hasValidCoordinates = (place: CandidatePlace): boolean =>
  isValidSeoulCoordinate(place.latitude, place.longitude);

const parseEventDate = (value: unknown): Date | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  const text = String(value).trim();
  if (!text) {
    return undefined;
  }

  const compact = text.match(/(20\d{2})(\d{2})(\d{2})/);
  const dashed = text.match(/(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  const matched = compact ?? dashed;
  if (!matched) {
    return undefined;
  }

  const [, year, month, day] = matched;
  const parsed = new Date(
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T23:59:59+09:00`
  );

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const isExpiredEvent = (place: CandidatePlace, targetDateTime?: string): boolean => {
  if (place.sourceDataset !== "culturalEventInfo") {
    return false;
  }

  const endDate = parseEventDate(place.metadata?.endDate ?? place.metadata?.displayDate);
  if (!endDate) {
    return false;
  }

  const target = targetDateTime ? new Date(targetDateTime) : new Date();
  const reference = Number.isNaN(target.getTime()) ? new Date() : target;
  return endDate.getTime() < reference.getTime();
};

const resolveSourceDatasets = (request?: ParsedRecommendationRequest): string[] => {
  const categories = request?.preferredCategories ?? [];
  const hasLivelyAmusementHint = shouldPreferAmusementCandidates(request);
  const selected = new Set<string>();
  const shouldSearchAllDatasets =
    categories.some((category) => {
      const normalized = category.toLowerCase();
      return REQUESTED_SPECIAL_CATEGORY_KEYWORDS.some((keyword) =>
        normalized.includes(keyword.toLowerCase())
      );
    }) || hasLivelyAmusementHint;

  if (shouldSearchAllDatasets) {
    return [];
  }

  for (const category of categories) {
    const normalized = category.toLowerCase();
    for (const group of CATEGORY_SOURCE_DATASETS) {
      if (group.keywords.some((keyword) => normalized.includes(keyword))) {
        group.sourceDatasets.forEach((sourceDataset) => selected.add(sourceDataset));
      }
    }
  }

  return selected.size ? [...selected] : DEFAULT_SOURCE_DATASETS;
};

const shouldPreferAmusementCandidates = (request?: ParsedRecommendationRequest): boolean => {
  const mood = request?.mood ?? [];
  const region = request?.region ?? "";
  const durationHours = request?.durationHours ?? 0;
  const budget = request?.budget;
  const hasLivelyMood = mood.some((item) => item.includes("\ud65c\uae30"));
  const isAmusementArea = AMUSEMENT_REGION_HINTS.some((hint) => region.includes(hint));
  const hasEnoughDuration = durationHours >= 4;
  const hasEnoughBudget = budget === undefined || budget === 200001 || budget >= 30000;

  return hasLivelyMood && isAmusementArea && hasEnoughDuration && hasEnoughBudget;
};

const buildKeywords = (request?: ParsedRecommendationRequest): string[] => {
  const categories = request?.preferredCategories ?? [];
  const keywords = [...categories];

  for (const category of categories) {
    const normalized = category.toLowerCase();
    for (const group of CATEGORY_KEYWORD_ALIASES) {
      if (group.triggers.some((trigger) => normalized.includes(trigger.toLowerCase()))) {
        keywords.push(...group.aliases);
      }
    }
  }

  if (shouldPreferAmusementCandidates(request)) {
    keywords.push(
      "\ub180\uc774\uc2dc\uc124",
      "\ub180\uc774\uacf5\uc6d0",
      "\ud14c\ub9c8\ud30c\ud06c",
      "\uc5b4\ub4dc\ubca4\ucc98",
      "\ub86f\ub370\uc6d4\ub4dc",
      "\ud5c8\uac00\ud14c\ub9c8\ud30c\ud06c\uc5c5"
    );
  }

  return uniqueStrings(keywords);
};

const normalizeRegionText = (region: string): string => region.toLowerCase().replace(/\s+/g, "");

const uniqueStrings = (items: string[]): string[] => [
  ...new Set(items.map((item) => item.trim()).filter(Boolean))
];

const resolveRegion = (region?: string): RegionResolution | undefined => {
  const rawRegion = region?.trim();
  if (!rawRegion) {
    return undefined;
  }

  const normalizedRegion = normalizeRegionText(rawRegion);

  if (
    NON_SEOUL_REGIONS.some((keyword) => normalizedRegion.includes(normalizeRegionText(keyword)))
  ) {
    return {
      isSupported: false,
      districts: [],
      aliases: [],
      error: `현재 SeoulMate는 서울 지역 공공데이터 기반 추천만 지원합니다. 입력 지역: ${rawRegion}`
    };
  }

  if (SEOUL_WIDE_REGIONS.some((keyword) => normalizedRegion === normalizeRegionText(keyword))) {
    return {
      isSupported: true,
      districts: [],
      aliases: []
    };
  }

  const profile = REGION_PROFILES.find((item) =>
    item.keywords.some((keyword) => normalizedRegion.includes(normalizeRegionText(keyword)))
  );

  if (profile) {
    return {
      isSupported: true,
      districts: uniqueStrings(profile.districts),
      aliases: uniqueStrings([...profile.keywords, ...profile.aliases])
    };
  }

  const directDistrict = SEOUL_DISTRICTS.find((district) => {
    const normalizedDistrict = normalizeRegionText(district);
    const shortDistrict = normalizeRegionText(district.replace(/구$/, ""));
    return normalizedRegion.includes(normalizedDistrict) || normalizedRegion === shortDistrict;
  });

  if (directDistrict) {
    return {
      isSupported: true,
      districts: [directDistrict],
      aliases: [directDistrict.replace(/구$/, "")]
    };
  }

  return {
    isSupported: true,
    districts: [],
    aliases: [rawRegion]
  };
};

const placeMatchesRegion = (
  place: CandidatePlace,
  rawRegion: string | undefined,
  regionResolution: RegionResolution | undefined
): boolean => {
  if (!rawRegion && !regionResolution) {
    return true;
  }

  const searchSpace = [place.region, place.address, place.title]
    .filter((value): value is string => Boolean(value))
    .map(normalizeRegionText)
    .join(" ");
  const normalizedRawRegion = rawRegion ? normalizeRegionText(rawRegion) : "";
  const regionTokens = uniqueStrings([
    ...(normalizedRawRegion && rawRegion ? [rawRegion] : []),
    ...(regionResolution?.districts ?? []),
    ...(regionResolution?.aliases ?? [])
  ]).map(normalizeRegionText);

  return regionTokens.some((token) => token && searchSpace.includes(token));
};

const uniqueById = (items: PublicDataset[]): PublicDataset[] => {
  const seen = new Set<number>();
  const unique: PublicDataset[] = [];

  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }

  return unique;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code);
  }

  if (error instanceof Error) {
    return error.name;
  }

  return "Unknown error";
};

export const fetchCandidatePlacesNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => {
  const request = state.parsedRequest;
  const sourceDatasets = resolveSourceDatasets(request);
  const keywords = buildKeywords(request);
  const regionResolution = resolveRegion(request?.region);

  if (regionResolution && !regionResolution.isSupported) {
    return {
      candidatePlaces: [],
      errors: [regionResolution.error ?? "Unsupported recommendation region"]
    };
  }

  const hasRegionFilter = Boolean(
    regionResolution?.districts.length || regionResolution?.aliases.length
  );

  try {
    const primary = await publicDataRepository.findRecommendationCandidates({
      region: request?.region,
      districts: regionResolution?.districts,
      regionAliases: regionResolution?.aliases,
      includeTitleRegionMatch: true,
      sourceDatasets,
      keywords,
      pageSize: 80
    });

    const regionalFallback =
      primary.length >= 8 || !hasRegionFilter
        ? []
        : await publicDataRepository.findRecommendationCandidates({
            region: request?.region,
            districts: regionResolution?.districts,
            regionAliases: regionResolution?.aliases,
            includeTitleRegionMatch: true,
            sourceDatasets,
            pageSize: 80
          });

    const diverseRegionalCandidates = hasRegionFilter
      ? (
          await Promise.all(
            sourceDatasets.map((sourceDataset) =>
              publicDataRepository.findRecommendationCandidates({
                region: request?.region,
                districts: regionResolution?.districts,
                regionAliases: regionResolution?.aliases,
                includeTitleRegionMatch: true,
                sourceDatasets: [sourceDataset],
                pageSize: 12
              })
            )
          )
        ).flat()
      : [];

    const generalFallback =
      primary.length >= 8 || hasRegionFilter
        ? []
        : await publicDataRepository.findRecommendationCandidates({
            sourceDatasets,
            keywords,
            pageSize: 80
          });

    const broadFallback =
      primary.length || regionalFallback.length || generalFallback.length || hasRegionFilter
        ? []
        : await publicDataRepository.findRecommendationCandidates({
            sourceDatasets,
            pageSize: 80
          });

    const candidatePlaces = uniqueById([
      ...primary,
      ...regionalFallback,
      ...diverseRegionalCandidates,
      ...generalFallback,
      ...broadFallback
    ])
      .map(mapCandidate)
      .filter(
        (place) => !hasRegionFilter || placeMatchesRegion(place, request?.region, regionResolution)
      )
      .filter(hasValidCoordinates)
      .filter((place) => !isExpiredEvent(place, request?.dateTime));

    return {
      candidatePlaces,
      errors: candidatePlaces.length
        ? []
        : ["No public_data candidates with coordinates matched the request"]
    };
  } catch (error) {
    return {
      candidatePlaces: [],
      errors: [`fetchCandidatePlaces failed: ${getErrorMessage(error)}`]
    };
  }
};
