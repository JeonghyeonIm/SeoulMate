export interface NormalizedPublicDataCategory {
  placeFamily: string | null;
  placeType: string | null;
  placeSubtype: string | null;
  categoryConfidence: number | null;
}

interface KakaoCategoryInput {
  categoryName?: string | null;
  categoryGroupName?: string | null;
  placeName?: string | null;
}

const ELIGIBLE_KAKAO_CATEGORY_GROUPS = ["음식점", "카페"];
const ELIGIBLE_KAKAO_CATEGORY_PATH_KEYWORDS = [
  "음식점",
  "카페",
  "주점",
  "술집",
  "호프",
  "펍",
  "이자카야",
  "보드카페",
  "만화카페",
  "pc방",
  "피시방"
];

interface CategoryInput {
  sourceDataset?: string | null;
  title?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface CategoryRule {
  family: string;
  type: string;
  subtype?: string;
  confidence: number;
}

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const normalize = (value: string): string => value.toLowerCase().replace(/\s+/g, "");

const includesAny = (haystack: string, needles: string[]): boolean =>
  needles.some((needle) => haystack.includes(normalize(needle)));

const createCategory = (
  family: string,
  type: string,
  confidence: number,
  subtype?: string | null
): NormalizedPublicDataCategory => ({
  placeFamily: family,
  placeType: type,
  placeSubtype: subtype ?? null,
  categoryConfidence: Number(confidence.toFixed(2))
});

const FOOD_TITLE_RULES: CategoryRule[] = [
  { family: "food", type: "korean_restaurant", confidence: 0.74 },
  { family: "food", type: "western_restaurant", confidence: 0.74 },
  { family: "food", type: "japanese_restaurant", confidence: 0.74 },
  { family: "food", type: "chinese_restaurant", confidence: 0.74 },
  { family: "food", type: "southeast_asian_restaurant", confidence: 0.74 },
  { family: "food", type: "meat_bbq_restaurant", confidence: 0.76 },
  { family: "food", type: "chicken_restaurant", confidence: 0.78 },
  { family: "food", type: "seafood_restaurant", confidence: 0.74 },
  { family: "food", type: "snack_food", confidence: 0.72 },
  { family: "food", type: "fast_food", confidence: 0.72 },
  { family: "food", type: "gimbap_lunchbox", confidence: 0.73 },
  { family: "food", type: "buffet", confidence: 0.73 },
  { family: "food", type: "family_restaurant", confidence: 0.73 },
  { family: "food", type: "dessert_shop", confidence: 0.7 },
  { family: "food", type: "ice_cream_shop", confidence: 0.72 },
  { family: "food", type: "brunch_restaurant", confidence: 0.74 },
  { family: "food", type: "ramen_restaurant", confidence: 0.72 },
  { family: "food", type: "noodle_restaurant", confidence: 0.72 }
];

const FOOD_KEYWORD_RULES: Array<{ keywords: string[]; category: CategoryRule }> = [
  {
    keywords: ["국밥", "백반", "한정식", "찌개", "감자탕", "순대국", "설렁탕", "곰탕", "해장국"],
    category: { family: "food", type: "korean_restaurant", confidence: 0.82 }
  },
  {
    keywords: [
      "고기",
      "삼겹",
      "갈비",
      "소고기",
      "돼지",
      "곱창",
      "막창",
      "양꼬치",
      "불고기",
      "족발",
      "보쌈"
    ],
    category: { family: "food", type: "meat_bbq_restaurant", confidence: 0.84 }
  },
  {
    keywords: ["초밥", "스시", "사시미", "오마카세", "우동", "돈카츠", "덮밥", "규카츠", "라멘"],
    category: { family: "food", type: "japanese_restaurant", confidence: 0.84 }
  },
  {
    keywords: ["짜장", "짬뽕", "탕수육", "마라", "훠궈", "딤섬", "양장피"],
    category: { family: "food", type: "chinese_restaurant", confidence: 0.84 }
  },
  {
    keywords: ["쌀국수", "팟타이", "커리", "인도", "타이", "베트남", "월남쌈", "나시고렝"],
    category: { family: "food", type: "southeast_asian_restaurant", confidence: 0.84 }
  },
  {
    keywords: ["파스타", "스테이크", "리조또", "샐러드", "브런치", "브런치카페"],
    category: { family: "food", type: "western_restaurant", confidence: 0.82 }
  },
  {
    keywords: ["버거", "햄버거", "핫도그", "샌드위치", "토스트"],
    category: { family: "food", type: "fast_food", confidence: 0.83 }
  },
  {
    keywords: ["떡볶이", "튀김", "순대", "어묵", "분식"],
    category: { family: "food", type: "snack_food", confidence: 0.83 }
  },
  {
    keywords: ["김밥", "도시락"],
    category: { family: "food", type: "gimbap_lunchbox", confidence: 0.83 }
  },
  {
    keywords: ["횟집", "회", "해물", "조개", "물회"],
    category: { family: "food", type: "seafood_restaurant", confidence: 0.82 }
  },
  {
    keywords: ["치킨", "통닭", "닭강정", "찜닭"],
    category: { family: "food", type: "chicken_restaurant", confidence: 0.84 }
  },
  {
    keywords: ["냉면", "칼국수", "국수", "메밀", "소바"],
    category: { family: "food", type: "noodle_restaurant", confidence: 0.82 }
  },
  {
    keywords: ["빙수", "젤라또", "아이스크림"],
    category: { family: "cafe", type: "dessert_cafe", confidence: 0.82, subtype: "ice_cream" }
  }
];

const TITLE_KEYWORD_RULES: Array<{ keywords: string[]; category: CategoryRule }> = [
  {
    keywords: ["lp바", "엘피바", "lp bar"],
    category: { family: "nightlife", type: "bar", subtype: "lp_bar", confidence: 0.96 }
  },
  {
    keywords: ["재즈바", "jazz bar", "재즈클럽"],
    category: { family: "nightlife", type: "bar", subtype: "jazz_bar", confidence: 0.96 }
  },
  {
    keywords: ["와인바", "wine bar", "와인샵", "비노테크"],
    category: { family: "nightlife", type: "bar", subtype: "wine_bar", confidence: 0.95 }
  },
  {
    keywords: ["칵테일바", "cocktail bar", "믹솔로지"],
    category: { family: "nightlife", type: "bar", subtype: "cocktail_bar", confidence: 0.95 }
  },
  {
    keywords: ["이자카야", "오뎅바", "사케바"],
    category: { family: "nightlife", type: "izakaya", confidence: 0.93 }
  },
  {
    keywords: ["펍", "pub", "호프", "맥주", "비어", "하이볼"],
    category: { family: "nightlife", type: "pub", confidence: 0.91 }
  },
  {
    keywords: ["막걸리", "전통주", "막걸리집"],
    category: { family: "nightlife", type: "traditional_liquor_bar", confidence: 0.92 }
  },
  {
    keywords: ["브런치", "브런치카페"],
    category: { family: "food", type: "brunch_restaurant", confidence: 0.88 }
  },
  {
    keywords: ["베이커리", "bakery", "제과점"],
    category: { family: "cafe", type: "bakery_cafe", confidence: 0.88 }
  },
  {
    keywords: ["디저트", "마카롱", "케이크", "파르페", "빙수"],
    category: { family: "cafe", type: "dessert_cafe", confidence: 0.85 }
  },
  {
    keywords: ["스터디카페", "study cafe"],
    category: { family: "cafe", type: "study_cafe", confidence: 0.9 }
  },
  {
    keywords: ["키즈카페"],
    category: { family: "cafe", type: "kids_cafe", confidence: 0.93 }
  },
  {
    keywords: ["만화카페"],
    category: { family: "activity", type: "comic_cafe", confidence: 0.92 }
  },
  {
    keywords: ["보드게임카페", "보드게임"],
    category: { family: "activity", type: "boardgame_cafe", confidence: 0.92 }
  },
  {
    keywords: ["방탈출", "escape room"],
    category: { family: "activity", type: "escape_room", confidence: 0.96 }
  },
  {
    keywords: ["노래방", "노래연습장", "코인노래방"],
    category: { family: "activity", type: "karaoke", confidence: 0.95 }
  },
  {
    keywords: ["볼링", "볼링장"],
    category: { family: "activity", type: "bowling_alley", confidence: 0.95 }
  },
  {
    keywords: ["당구", "포켓볼", "당구장"],
    category: { family: "activity", type: "billiards", confidence: 0.95 }
  },
  {
    keywords: ["오락실", "아케이드", "게임장"],
    category: { family: "activity", type: "arcade", confidence: 0.94 }
  },
  {
    keywords: ["pc방", "피시방"],
    category: { family: "activity", type: "pc_cafe", confidence: 0.95 }
  },
  {
    keywords: ["찜질방", "사우나"],
    category: { family: "wellness", type: "bathhouse", confidence: 0.94 }
  },
  {
    keywords: ["캠핑", "글램핑", "야영장"],
    category: { family: "outdoor", type: "camping", confidence: 0.94 }
  },
  {
    keywords: ["놀이공원", "테마파크", "워터파크", "어드벤처"],
    category: { family: "activity", type: "amusement_park", confidence: 0.94 }
  },
  {
    keywords: ["미술관", "갤러리"],
    category: { family: "culture", type: "gallery", confidence: 0.91 }
  },
  {
    keywords: ["박물관", "기념관"],
    category: { family: "culture", type: "museum", confidence: 0.91 }
  },
  {
    keywords: ["도서관"],
    category: { family: "culture", type: "library", confidence: 0.91 }
  },
  {
    keywords: ["공연장", "아트홀", "극장", "시어터"],
    category: { family: "culture", type: "performance_venue", confidence: 0.9 }
  },
  {
    keywords: ["공원", "수목원"],
    category: { family: "park", type: "city_park", confidence: 0.88 }
  },
  {
    keywords: ["산책", "둘레길", "한강"],
    category: { family: "walk", type: "walk_course", confidence: 0.86 }
  },
  {
    keywords: ["전망대", "야경"],
    category: { family: "attraction", type: "viewpoint", confidence: 0.88 }
  }
];

const BUSINESS_TYPE_RULES = new Map<string, NormalizedPublicDataCategory>([
  ["한식", createCategory("food", "korean_restaurant", 0.96)],
  ["경양식", createCategory("food", "western_restaurant", 0.95)],
  ["일식", createCategory("food", "japanese_restaurant", 0.95)],
  ["중국식", createCategory("food", "chinese_restaurant", 0.95)],
  ["외국음식전문점(인도,태국등)", createCategory("food", "southeast_asian_restaurant", 0.95)],
  ["식육(숯불구이)", createCategory("food", "meat_bbq_restaurant", 0.95)],
  ["통닭(치킨)", createCategory("food", "chicken_restaurant", 0.95)],
  ["횟집", createCategory("food", "seafood_restaurant", 0.95)],
  ["냉면집", createCategory("food", "noodle_restaurant", 0.94)],
  ["복어취급", createCategory("food", "specialty_restaurant", 0.93, "blowfish")],
  ["탕류(보신용)", createCategory("food", "specialty_restaurant", 0.93, "soup")],
  ["분식", createCategory("food", "snack_food", 0.94)],
  ["패스트푸드", createCategory("food", "fast_food", 0.94)],
  ["김밥(도시락)", createCategory("food", "gimbap_lunchbox", 0.95)],
  ["뷔페식", createCategory("food", "buffet", 0.94)],
  ["패밀리레스트랑", createCategory("food", "family_restaurant", 0.93)],
  ["커피숍", createCategory("cafe", "coffee_shop", 0.96)],
  ["까페", createCategory("cafe", "coffee_shop", 0.93)],
  ["다방", createCategory("cafe", "tea_house", 0.9)],
  ["전통찻집", createCategory("cafe", "tea_house", 0.95)],
  ["떡카페", createCategory("cafe", "dessert_cafe", 0.94, "rice_cake_cafe")],
  ["키즈카페", createCategory("cafe", "kids_cafe", 0.96)],
  ["과자점", createCategory("cafe", "bakery_cafe", 0.92)],
  ["아이스크림", createCategory("cafe", "dessert_cafe", 0.92, "ice_cream")],
  ["라이브카페", createCategory("nightlife", "bar", 0.92, "live_cafe")],
  ["호프/통닭", createCategory("nightlife", "pub", 0.95, "chicken_pub")],
  ["정종/대포집/소주방", createCategory("nightlife", "pub", 0.95, "soju_bar")],
  ["감성주점", createCategory("nightlife", "bar", 0.95, "trendy_bar")],
  ["단란주점", createCategory("nightlife", "bar", 0.95, "karaoke_bar")],
  ["푸드트럭", createCategory("food", "street_food", 0.94)],
  ["기타 휴게음식점", createCategory("food", "casual_eatery", 0.72)],
  ["일반조리판매", createCategory("food", "takeout_eatery", 0.74)],
  ["기타", createCategory("food", "generic_eatery", 0.55)]
]);

const CULTURAL_SPACE_RULES = new Map<string, NormalizedPublicDataCategory>([
  ["미술관/갤러리", createCategory("culture", "gallery", 0.97)],
  ["공연장", createCategory("culture", "performance_venue", 0.97)],
  ["도서관", createCategory("culture", "library", 0.97)],
  ["박물관/기념관", createCategory("culture", "museum", 0.97, "memorial_or_museum")],
  ["문화원", createCategory("culture", "cultural_center", 0.95)],
  ["문화예술회관", createCategory("culture", "arts_center", 0.95)],
  ["기타", createCategory("culture", "cultural_space", 0.62)]
]);

const CULTURAL_EVENT_RULES = new Map<string, NormalizedPublicDataCategory>([
  ["교육/체험", createCategory("event", "education_experience", 0.97)],
  ["전시/미술", createCategory("event", "exhibition", 0.97)],
  ["클래식", createCategory("event", "classical_concert", 0.97)],
  ["콘서트", createCategory("event", "concert", 0.97)],
  ["국악", createCategory("event", "traditional_music", 0.97)],
  ["연극", createCategory("event", "theater", 0.97)],
  ["무용", createCategory("event", "dance", 0.97)],
  ["뮤지컬/오페라", createCategory("event", "musical_opera", 0.97)],
  ["독주/독창회", createCategory("event", "recital", 0.97)],
  ["영화", createCategory("event", "film_screening", 0.97)],
  ["축제-문화/예술", createCategory("event", "festival", 0.96, "arts_festival")],
  ["축제-전통/역사", createCategory("event", "festival", 0.96, "history_festival")],
  ["축제-자연/경관", createCategory("event", "festival", 0.96, "nature_festival")],
  ["축제-시민화합", createCategory("event", "festival", 0.96, "community_festival")],
  ["축제-관광/체육", createCategory("event", "festival", 0.96, "tourism_sports_festival")],
  ["축제-기타", createCategory("event", "festival", 0.9)],
  ["기타", createCategory("event", "event", 0.6)]
]);

const NIGHT_SPOT_RULES = new Map<string, NormalizedPublicDataCategory>([
  ["공원/광장", createCategory("attraction", "night_view_spot", 0.91, "park_or_square")],
  ["공공시설", createCategory("attraction", "night_view_spot", 0.9, "public_facility")],
  ["문화/체육", createCategory("culture", "night_culture_spot", 0.88)],
  ["가로/마을", createCategory("walk", "night_walk_street", 0.9)]
]);

const DATASET_DEFAULT_RULES = new Map<string, NormalizedPublicDataCategory>([
  ["TbVwRestaurants", createCategory("food", "tourist_restaurant", 0.82)],
  ["TbVwNature", createCategory("nature", "nature_spot", 0.9)],
  ["TbVwAttractions", createCategory("attraction", "tourist_attraction", 0.9)],
  ["SearchParkInfoService", createCategory("park", "city_park", 0.95)],
  ["LOCALDATA_072200", createCategory("activity", "karaoke", 0.97)],
  ["LOCALDATA_072100", createCategory("wellness", "bathhouse", 0.97)],
  ["LOCALDATA_072300", createCategory("activity", "billiards", 0.97)],
  [
    "LOCALDATA_072601",
    createCategory("activity", "sports_facility", 0.94, "bowling_or_indoor_sports")
  ],
  ["LOCALDATA_072205", createCategory("activity", "arcade", 0.97)],
  ["LOCALDATA_072206", createCategory("activity", "arcade", 0.97)],
  ["LOCALDATA_072207", createCategory("activity", "pc_cafe", 0.97)],
  ["LOCALDATA_074102", createCategory("activity", "theme_activity", 0.92)],
  ["LOCALDATA_160481", createCategory("outdoor", "camping", 0.97)],
  ["LOCALDATA_160321", createCategory("activity", "amusement_park", 0.97)]
]);

const applyTitleRule = (normalizedText: string): NormalizedPublicDataCategory | null => {
  for (const rule of TITLE_KEYWORD_RULES) {
    if (includesAny(normalizedText, rule.keywords)) {
      return createCategory(
        rule.category.family,
        rule.category.type,
        rule.category.confidence,
        rule.category.subtype
      );
    }
  }

  return null;
};

const applyFoodKeywordRule = (normalizedText: string): NormalizedPublicDataCategory | null => {
  for (const rule of FOOD_KEYWORD_RULES) {
    if (includesAny(normalizedText, rule.keywords)) {
      return createCategory(
        rule.category.family,
        rule.category.type,
        rule.category.confidence,
        rule.category.subtype
      );
    }
  }

  return null;
};

const classifyPermitBusiness = (
  businessType: string,
  normalizedText: string
): NormalizedPublicDataCategory | null => {
  const direct = BUSINESS_TYPE_RULES.get(businessType);
  if (!direct) {
    return null;
  }

  const titleOverride = applyTitleRule(normalizedText);
  const foodKeywordOverride = applyFoodKeywordRule(normalizedText);
  if (!titleOverride) {
    return foodKeywordOverride ?? direct;
  }

  if (direct.placeFamily === "food" && titleOverride.placeFamily === "food") {
    return titleOverride;
  }

  if (
    (direct.placeFamily === "food" || direct.placeFamily === "cafe") &&
    titleOverride.placeFamily === "nightlife"
  ) {
    return titleOverride;
  }

  if (direct.placeFamily === "food" && titleOverride.placeFamily === "cafe") {
    return titleOverride;
  }

  return foodKeywordOverride ?? direct;
};

const refineTourismCategory = (
  sourceDataset: string,
  normalizedText: string
): NormalizedPublicDataCategory | null => {
  const titleRule = applyTitleRule(normalizedText);
  if (titleRule) {
    return titleRule;
  }

  if (sourceDataset === "TbVwRestaurants") {
    if (includesAny(normalizedText, ["카페", "커피", "디저트", "베이커리"])) {
      return createCategory("cafe", "tourist_cafe", 0.84);
    }

    return createCategory("food", "tourist_restaurant", 0.82);
  }

  if (sourceDataset === "TbVwNature") {
    if (includesAny(normalizedText, ["공원", "수목원"])) {
      return createCategory("park", "park_nature_spot", 0.88);
    }
    if (includesAny(normalizedText, ["산책", "둘레길", "한강"])) {
      return createCategory("walk", "walk_course", 0.88);
    }
    return createCategory("nature", "nature_spot", 0.9);
  }

  if (sourceDataset === "TbVwAttractions") {
    if (includesAny(normalizedText, ["박물관", "미술관", "갤러리", "전시"])) {
      return createCategory("culture", "tourist_culture_spot", 0.86);
    }
    if (includesAny(normalizedText, ["전망대", "야경"])) {
      return createCategory("attraction", "viewpoint", 0.88);
    }
    return createCategory("attraction", "tourist_attraction", 0.9);
  }

  return null;
};

const classifyGenericText = (normalizedText: string): NormalizedPublicDataCategory => {
  const titleRule = applyTitleRule(normalizedText);
  if (titleRule) {
    return titleRule;
  }

  const foodKeywordRule = applyFoodKeywordRule(normalizedText);
  if (foodKeywordRule) {
    return foodKeywordRule;
  }

  if (includesAny(normalizedText, ["한식", "백반", "국밥", "갈비", "고기", "식당", "맛집"])) {
    return createCategory("food", "restaurant", 0.66);
  }

  if (includesAny(normalizedText, ["전시", "갤러리", "문화공간", "공연", "뮤지엄"])) {
    return createCategory("culture", "cultural_space", 0.66);
  }

  if (includesAny(normalizedText, ["공원", "산책", "둘레길", "한강"])) {
    return createCategory("walk", "walk_spot", 0.64);
  }

  return createCategory("attraction", "place", 0.4);
};

export const classifyPublicDataCategory = (input: CategoryInput): NormalizedPublicDataCategory => {
  const sourceDataset = toText(input.sourceDataset);
  const title = toText(input.title);
  const category = toText(input.category);
  const metadata = input.metadata ?? {};
  const businessType = toText(metadata.sanitizedBusinessType) || toText(metadata.businessType);
  const subjectCode = toText(metadata.subjectCode);
  const codeName = toText(metadata.codeName);
  const themeCode = toText(metadata.themeCode);
  const tags = toText(metadata.tags);
  const menu = toText(metadata.representativeMenu);
  const description = toText(metadata.description) || toText(metadata.facilityDescription);
  const normalizedText = normalize(
    [title, category, businessType, subjectCode, codeName, themeCode, tags, menu, description].join(
      " "
    )
  );

  if (sourceDataset === "LOCALDATA_072404" || sourceDataset === "LOCALDATA_072405") {
    const permitCategory = classifyPermitBusiness(businessType, normalizedText);
    if (permitCategory) {
      return permitCategory;
    }
  }

  if (sourceDataset === "culturalSpaceInfo") {
    const direct = CULTURAL_SPACE_RULES.get(subjectCode);
    return direct ?? classifyGenericText(normalizedText);
  }

  if (sourceDataset === "culturalEventInfo") {
    const direct = CULTURAL_EVENT_RULES.get(codeName);
    return direct ?? classifyGenericText(normalizedText);
  }

  if (sourceDataset === "viewNightSpot") {
    const direct = NIGHT_SPOT_RULES.get(subjectCode);
    return direct ?? createCategory("attraction", "night_view_spot", 0.74);
  }

  if (
    sourceDataset === "TbVwRestaurants" ||
    sourceDataset === "TbVwNature" ||
    sourceDataset === "TbVwAttractions"
  ) {
    return (
      refineTourismCategory(sourceDataset, normalizedText) ?? classifyGenericText(normalizedText)
    );
  }

  if (sourceDataset === "SearchParkInfoService") {
    return createCategory("park", "city_park", 0.95);
  }

  const datasetDefault = DATASET_DEFAULT_RULES.get(sourceDataset);
  if (datasetDefault) {
    const titleRule = applyTitleRule(normalizedText);
    return titleRule ?? datasetDefault;
  }

  return classifyGenericText(normalizedText);
};

export const classifyKakaoPlaceCategory = (
  input: KakaoCategoryInput
): NormalizedPublicDataCategory | null => {
  const categoryName = toText(input.categoryName);
  const categoryGroupName = toText(input.categoryGroupName);
  const placeName = toText(input.placeName);
  const normalized = normalize([categoryGroupName, categoryName, placeName].join(" "));

  const titleRule = applyTitleRule(normalized);
  if (titleRule) {
    return titleRule;
  }

  if (includesAny(normalized, ["카페", "커피", "디저트", "베이커리"])) {
    if (includesAny(normalized, ["베이커리"])) {
      return createCategory("cafe", "bakery_cafe", 0.95);
    }
    if (includesAny(normalized, ["디저트", "빙수", "젤라또"])) {
      return createCategory("cafe", "dessert_cafe", 0.95);
    }
    return createCategory("cafe", "coffee_shop", 0.95);
  }

  if (includesAny(normalized, ["술집", "주점", "포차", "호프", "펍", "이자카야", "와인"])) {
    if (includesAny(normalized, ["이자카야"])) {
      return createCategory("nightlife", "izakaya", 0.96);
    }
    if (includesAny(normalized, ["호프", "펍"])) {
      return createCategory("nightlife", "pub", 0.96);
    }
    return createCategory("nightlife", "bar", 0.95);
  }

  const foodRule = applyFoodKeywordRule(normalized);
  if (foodRule) {
    return createCategory(
      foodRule.placeFamily ?? "food",
      foodRule.placeType ?? "restaurant",
      0.95,
      foodRule.placeSubtype
    );
  }

  if (includesAny(normalized, ["음식점", "식당", "한식", "양식", "중식", "일식", "분식"])) {
    return createCategory("food", "restaurant", 0.93);
  }

  return null;
};

export const isEligibleKakaoPlaceCategory = (input: KakaoCategoryInput): boolean => {
  const categoryName = toText(input.categoryName);
  const categoryGroupName = toText(input.categoryGroupName);
  const normalized = normalize([categoryGroupName, categoryName].join(" "));

  if (
    ELIGIBLE_KAKAO_CATEGORY_GROUPS.some(
      (group) => normalize(group) === normalize(categoryGroupName)
    )
  ) {
    return true;
  }

  return includesAny(normalized, ELIGIBLE_KAKAO_CATEGORY_PATH_KEYWORDS);
};
