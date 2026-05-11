import { openaiClient } from "../../clients/openai.client";
import type {
  ParsedRecommendationRequest,
  SeoulMateGraphState,
  SeoulMateGraphUpdate
} from "../recommendation.state";

type ParsedRequestFromAi = {
  region: string | null;
  budget: number | null;
  dateTime: string | null;
  durationHours: number | null;
  mood: string[];
  purpose: string | null;
  preferredCategories: string[];
};

const ALLOWED_MOODS = [
  "조용한",
  "힙한",
  "낭만적인",
  "로맨틱",
  "활기찬",
  "고즈넉한",
  "현대적인",
  "감성적인",
  "자연친화적"
];

const requestSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    region: { type: ["string", "null"] },
    budget: { type: ["number", "null"] },
    dateTime: { type: ["string", "null"], description: "ISO-8601 datetime if present" },
    durationHours: { type: ["number", "null"] },
    mood: { type: "array", items: { type: "string" } },
    purpose: { type: ["string", "null"] },
    preferredCategories: { type: "array", items: { type: "string" } }
  },
  required: [
    "region",
    "budget",
    "dateTime",
    "durationHours",
    "mood",
    "purpose",
    "preferredCategories"
  ]
};

const buildParsingInstructions =
  (): string => `사용자 입력을 서울 데이트 코스 추천 조건으로 구조화하세요.
- 내부적으로만 조건을 단계별로 점검하고, 추론 과정은 출력하지 마세요.
- 장소를 새로 만들지 말고 지역, 예산, 시간, 분위기, 목적, 선호 카테고리 조건만 추출하세요.
- "카페", "전시", "맛집"처럼 특정 카테고리가 언급되어도 preferredCategories에 한 종류만 반복하지 말고, 데이트 코스에 필요한 보조 카테고리를 1~2개 함께 넣으세요.
- mood는 반드시 다음 값 안에서만 고르세요: ${ALLOWED_MOODS.join(", ")}.
- 첫 만남/어색하지 않은/부담 적은 요청은 mood에 "조용한", "고즈넉한"을 우선 반영하세요.
- 실내/비 오는 날 요청은 mood에 "조용한" 또는 "감성적인"을 반영하고, preferredCategories에 "카페", "문화공간"을 우선 반영하세요.
- 오늘 기준 날짜는 ${getCurrentKstDateLabel()} KST입니다. dateTime은 날짜/시간 단서가 있을 때 이 기준 날짜로 ISO-8601 형식에 가깝게 반환하세요.

예시 1
입력: "성수에서 3만 원 이하로 어색하지 않은 첫 데이트 코스 추천해줘"
출력: {"region":"성수","budget":30000,"dateTime":null,"durationHours":3,"mood":["조용한","고즈넉한"],"purpose":"첫 데이트","preferredCategories":["카페","문화공간","산책","음식점"]}

예시 2
입력: "비 오는 날 홍대에서 실내 위주로 4시간 데이트"
출력: {"region":"홍대","budget":null,"dateTime":null,"durationHours":4,"mood":["조용한","감성적인"],"purpose":"데이트","preferredCategories":["카페","문화공간","음식점"]}`;

const compactString = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const normalizeMood = (value: string): string | undefined => {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  if (ALLOWED_MOODS.includes(normalized)) {
    return normalized;
  }

  if (normalized.includes("로맨틱") || normalized.includes("로맨스")) {
    return "로맨틱";
  }

  if (normalized.includes("낭만")) {
    return "낭만적인";
  }

  if (normalized.includes("자연") || normalized.includes("숲") || normalized.includes("야외")) {
    return "자연친화적";
  }

  return ALLOWED_MOODS.find((mood) => normalized.includes(mood.replace(/적인$|한$|적$/g, "")));
};

const normalizeMoods = (values: string[]): string[] => [
  ...new Set(values.map(normalizeMood).filter((mood): mood is string => Boolean(mood)))
];

const uniqueStrings = (values: Array<string | undefined>): string[] => [
  ...new Set(
    values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))
  )
];

const cleanParsedRequest = (value: ParsedRequestFromAi): ParsedRecommendationRequest => ({
  region: compactString(value.region),
  budget:
    typeof value.budget === "number" && value.budget >= 0 ? Math.round(value.budget) : undefined,
  dateTime: compactString(value.dateTime),
  durationHours:
    typeof value.durationHours === "number" && value.durationHours > 0
      ? value.durationHours
      : undefined,
  mood: normalizeMoods(value.mood),
  purpose: compactString(value.purpose),
  preferredCategories: value.preferredCategories.map((item) => item.trim()).filter(Boolean)
});

const mergeParsedRequest = (
  fallback: ParsedRecommendationRequest,
  aiParsed?: ParsedRecommendationRequest,
  preset?: ParsedRecommendationRequest
): ParsedRecommendationRequest => ({
  region: preset?.region ?? aiParsed?.region ?? fallback.region,
  budget: preset?.budget ?? aiParsed?.budget ?? fallback.budget,
  dateTime: preset?.dateTime ?? aiParsed?.dateTime ?? fallback.dateTime,
  durationHours: preset?.durationHours ?? aiParsed?.durationHours ?? fallback.durationHours,
  mood: normalizeMoods([
    ...(fallback.mood ?? []),
    ...(aiParsed?.mood ?? []),
    ...(preset?.mood ?? [])
  ]),
  purpose: preset?.purpose ?? aiParsed?.purpose ?? fallback.purpose,
  preferredCategories: uniqueStrings([
    ...(fallback.preferredCategories ?? []),
    ...(aiParsed?.preferredCategories ?? []),
    ...(preset?.preferredCategories ?? [])
  ])
});

const toKstIso = (daysToAdd: number, hour = 12): string => {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + daysToAdd);
  kst.setUTCHours(hour, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000).toISOString();
};

const getCurrentKstDateLabel = (): string => {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const hasRelativeDateExpression = (input: string): boolean =>
  /(오늘|지금|내일|모레|이번\s*주|다음\s*주|\d+\s*일\s*(뒤|후)|일요일|월요일|화요일|수요일|목요일|금요일|토요일)/.test(
    input
  );

const parseHourHint = (input: string): number | undefined => {
  const matched = input.match(/(\d{1,2})\s*시(?!간)/);
  if (!matched) {
    return undefined;
  }

  const hour = Number(matched[1]);
  return hour >= 0 && hour <= 23 ? hour : undefined;
};

const parseWeekdayDateTime = (input: string): string | undefined => {
  const weekdayMap: Record<string, number> = {
    일요일: 0,
    월요일: 1,
    화요일: 2,
    수요일: 3,
    목요일: 4,
    금요일: 5,
    토요일: 6,
    일: 0,
    월: 1,
    화: 2,
    수: 3,
    목: 4,
    금: 5,
    토: 6
  };
  const matched = input.match(
    /(?:(이번|다음)\s*주\s*(일요일|월요일|화요일|수요일|목요일|금요일|토요일|일|월|화|수|목|금|토))|(일요일|월요일|화요일|수요일|목요일|금요일|토요일)/
  );

  if (!matched) {
    return undefined;
  }

  const weekPrefix = matched[1];
  const targetDay = weekdayMap[matched[2] ?? matched[3]];
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentDay = kst.getUTCDay();
  let daysToAdd = targetDay - currentDay;

  if (weekPrefix === "다음") {
    daysToAdd += daysToAdd <= 0 ? 7 : 0;
  } else if (daysToAdd < 0) {
    daysToAdd += 7;
  }

  return toKstIso(daysToAdd, parseHourHint(input) ?? 12);
};

const parseDateTimeHint = (input: string): string | undefined => {
  const absoluteDate = input.match(/(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  if (absoluteDate) {
    const [, yyyy, mm, dd] = absoluteDate;
    return new Date(
      `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${String(parseHourHint(input) ?? 12).padStart(2, "0")}:00:00+09:00`
    ).toISOString();
  }

  const daysLater = input.match(/(\d+)\s*일\s*(뒤|후)/);
  if (daysLater) {
    return toKstIso(Number(daysLater[1]), parseHourHint(input) ?? 12);
  }

  if (input.includes("모레")) {
    return toKstIso(2, parseHourHint(input) ?? 12);
  }

  if (input.includes("내일")) {
    return toKstIso(1, parseHourHint(input) ?? 12);
  }

  if (input.includes("오늘") || input.includes("지금")) {
    const hour = parseHourHint(input);
    if (hour !== undefined) {
      return toKstIso(0, hour);
    }

    return new Date().toISOString();
  }

  const weekdayDateTime = parseWeekdayDateTime(input);
  if (weekdayDateTime) {
    return weekdayDateTime;
  }

  return undefined;
};

const parseBudget = (input: string): number | undefined => {
  const manWon = input.match(/(\d+(?:\.\d+)?)\s*만\s*원?/);
  if (manWon) {
    return Math.round(Number(manWon[1]) * 10000);
  }

  const cheonWon = input.match(/(\d+(?:\.\d+)?)\s*천\s*원?/);
  if (cheonWon) {
    return Math.round(Number(cheonWon[1]) * 1000);
  }

  const won = input.match(/(\d[\d,]*)\s*원/);
  if (won) {
    return Number(won[1].replace(/,/g, ""));
  }

  return undefined;
};

const parseDuration = (input: string): number | undefined => {
  const matched = input.match(/(\d+(?:\.\d+)?)\s*시간/);
  return matched ? Number(matched[1]) : undefined;
};

const parseRegion = (input: string): string | undefined => {
  const matched = input.match(
    /(성수|서울숲|왕십리|한양대|행당|홍대|연남|합정|망원|강남|신사|압구정|잠실|여의도|익선|이태원|한남|을지로|명동|종로|혜화|신촌|건대|서촌|북촌|성북|용산|마포|성동|송파|서초|중구|종로구|강남구|성동구|마포구|용산구)/
  );
  if (matched?.[1]) {
    return matched[1];
  }

  const genericRegion = input.match(/([가-힣A-Za-z0-9]+)\s*(?:에서|주변|근처|일대|쪽)/);
  return genericRegion?.[1];
};

const parseMoods = (input: string): string[] => {
  const moodKeywords = [
    "조용한",
    "힙한",
    "낭만적인",
    "로맨틱",
    "활기찬",
    "고즈넉한",
    "현대적인",
    "감성적인",
    "자연친화적"
  ];
  const moods = moodKeywords.filter((keyword) =>
    input.includes(keyword.replace(/적인$|한$|적$/g, ""))
  );

  if ((input.includes("비") && input.includes("안 맞")) || input.includes("실내")) {
    moods.push("조용한", "감성적인");
  }

  return normalizeMoods(moods);
};

const parsePreferredCategories = (input: string): string[] => {
  const categories = [
    ["카페", "카페"],
    ["전시", "문화공간"],
    ["문화", "문화공간"],
    ["산책", "산책"],
    ["공원", "공원"],
    ["식사", "음식점"],
    ["맛집", "음식점"],
    ["관광", "관광명소"],
    ["야경", "야경명소"]
  ];

  const parsed = categories
    .filter(([keyword]) => input.includes(keyword))
    .map(([, value]) => value);

  if ((input.includes("비") && input.includes("안 맞")) || input.includes("실내")) {
    parsed.push("카페", "문화공간");
  }

  const hasAny = (keywords: string[]): boolean =>
    keywords.some((keyword) => input.includes(keyword));

  const hasStandaloneDrinkWord = /(^|[^\uac00-\ud7a3])\uc220([^\uac00-\ud7a3]|$)/.test(input);
  const hasNoAlcoholIntent =
    input.includes("\uc220 \ubabb") ||
    input.includes("\uc220\ubabb") ||
    input.includes("\uc220 \uc548") ||
    input.includes("\uc220\uc548") ||
    input.includes("\uc220 \uc548 \ub9c8") ||
    input.includes("\uc220\uc548\ub9c8");

  if (
    (!hasNoAlcoholIntent && hasStandaloneDrinkWord) ||
    hasAny([
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
      "\ud558\uc774\ubcfc \ub9db\uc9d1",
      "\ub9c9\uac78\ub9ac",
      "\ub9c9\uac78\ub9ac\uc9d1",
      "\uc804\ud1b5\uc8fc\uc810",
      "\ub8e8\ud504\ud0d1\ubc14",
      "\ud63c\uc220"
    ])
  ) {
    parsed.push("\uc220\uc9d1");
  }

  if (hasAny(["\uce58\ud0a8", "\ud1b5\ub2ed", "\ud53c\uc790", "\ud53c\uc790\uc9d1"])) {
    parsed.push("\uc74c\uc2dd\uc810", "\uce58\ud0a8", "\ud53c\uc790");
  }

  if (
    hasAny([
      "\ub178\ub798\ubc29",
      "\ub178\ub798\uc5f0\uc2b5\uc7a5",
      "\ucf54\uc778\ub178\ub798\ubc29"
    ])
  ) {
    parsed.push("\ub178\ub798\ubc29");
  }

  if (
    hasAny([
      "\ubc29\ud0c8\ucd9c",
      "\ubcf4\ub4dc\uac8c\uc784",
      "\ubcf4\ub4dc\uac8c\uc784\uce74\ud398",
      "\ucc1c\uc9c8\ubc29",
      "\ubcfc\ub9c1",
      "\ub2f9\uad6c",
      "\ub9cc\ud654\uce74\ud398",
      "\uacf5\ubc29",
      "\uc6d0\ub370\uc774\ud074\ub798\uc2a4",
      "\ud5a5\uc218",
      "\ub3c4\uc790\uae30",
      "\ud074\ub77c\uc774\ubc0d",
      "VR",
      "vr",
      "\uc544\ucf00\uc774\ub4dc",
      "\uc2e4\ub0b4 \ub180\uac70\ub9ac",
      "\uc2e4\ub0b4\ub180\uac70\ub9ac",
      "\uc561\ud2f0\ube44\ud2f0",
      "\uccb4\ud5d8"
    ])
  ) {
    parsed.push("\uc2e4\ub0b4\ub180\uac70\ub9ac");
  }

  if (hasAny(["\ud074\ub7fd", "\ub098\uc774\ud2b8", "\uac10\uc131\uc8fc\uc810"])) {
    parsed.push("\ud074\ub7fd");
  }

  if (
    hasAny([
      "lp\ubc14",
      "lp bar",
      "\uc5d8\ud53c\ubc14",
      "\uc7ac\uc988\ubc14",
      "jazz bar",
      "\uc640\uc778\ubc14",
      "wine bar",
      "\uce75\ud14c\uc77c\ubc14",
      "cocktail bar"
    ])
  ) {
    parsed.push("\uc220\uc9d1");
  }

  if (
    hasAny([
      "\ucea0\ud551",
      "\ucea0\ud551\uc7a5",
      "\uc57c\uc601",
      "\uae00\ub7a8\ud551",
      "\ubc14\ubca0\ud050",
      "\ud53c\ud06c\ub2c9\uc7a5"
    ])
  ) {
    parsed.push("\ucea0\ud551\uc7a5");
  }

  if (
    hasAny([
      "\ub180\uc774\uc2dc\uc124",
      "\ub180\uc774\uacf5\uc6d0",
      "\ud14c\ub9c8\ud30c\ud06c",
      "\uc5b4\ud2b8\ub799\uc158",
      "\uc6cc\ud130\ud30c\ud06c",
      "\ub86f\ub370\uc6d4\ub4dc",
      "\uc5b4\ub9b0\uc774\ub300\uacf5\uc6d0\ub180\uc774\ub3d9\uc0b0"
    ])
  ) {
    parsed.push("\ub180\uc774\uc2dc\uc124");
  }

  return [...new Set(parsed)];
};

const parsePurpose = (input: string): string | undefined => {
  if (input.includes("첫 데이트") || input.includes("첫데이트") || input.includes("첫 만남")) {
    return "첫 데이트";
  }

  if (input.includes("데이트")) {
    return "데이트";
  }

  return undefined;
};

const parseHeuristically = (input: string): ParsedRecommendationRequest => ({
  region: parseRegion(input),
  budget: parseBudget(input),
  dateTime: parseDateTimeHint(input),
  durationHours: parseDuration(input) ?? 3,
  mood: parseMoods(input),
  purpose: parsePurpose(input),
  preferredCategories: parsePreferredCategories(input)
});

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

export const parseUserRequestNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => {
  const fallback = parseHeuristically(state.rawInput);
  const preset = state.parsedRequest;
  const hasPresetDateTime = Boolean(preset?.dateTime);

  try {
    const parsed = await openaiClient.createJsonResponse<ParsedRequestFromAi>({
      schemaName: "seoulmate_recommendation_request",
      schema: requestSchema,
      instructions: buildParsingInstructions(),
      input: state.rawInput
    });
    const cleaned = cleanParsedRequest(parsed);
    const parsedRequest = mergeParsedRequest(fallback, cleaned, preset);

    if (!hasPresetDateTime && fallback.dateTime && hasRelativeDateExpression(state.rawInput)) {
      parsedRequest.dateTime = fallback.dateTime;
    }

    return {
      parsedRequest
    };
  } catch (error) {
    return {
      parsedRequest: mergeParsedRequest(fallback, undefined, preset),
      errors: [`parseUserRequest fallback used: ${getErrorMessage(error)}`]
    };
  }
};
