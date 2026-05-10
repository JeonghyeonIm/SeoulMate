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
- 첫 만남/어색하지 않은/부담 적은 요청은 mood에 "조용한", "부담 적은"을 우선 반영하세요.
- 오늘 기준 날짜는 ${getCurrentKstDateLabel()} KST입니다. dateTime은 날짜/시간 단서가 있을 때 이 기준 날짜로 ISO-8601 형식에 가깝게 반환하세요.

예시 1
입력: "성수에서 3만 원 이하로 어색하지 않은 첫 데이트 코스 추천해줘"
출력: {"region":"성수","budget":30000,"dateTime":null,"durationHours":3,"mood":["조용한","부담 적은"],"purpose":"첫 데이트","preferredCategories":["카페","문화공간","산책","음식점"]}

예시 2
입력: "비 오는 날 홍대에서 실내 위주로 4시간 데이트"
출력: {"region":"홍대","budget":null,"dateTime":null,"durationHours":4,"mood":["실내","조용한"],"purpose":"데이트","preferredCategories":["카페","문화공간","음식점"]}`;

const compactString = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const cleanParsedRequest = (value: ParsedRequestFromAi): ParsedRecommendationRequest => ({
  region: compactString(value.region),
  budget:
    typeof value.budget === "number" && value.budget > 0 ? Math.round(value.budget) : undefined,
  dateTime: compactString(value.dateTime),
  durationHours:
    typeof value.durationHours === "number" && value.durationHours > 0
      ? value.durationHours
      : undefined,
  mood: value.mood.map((item) => item.trim()).filter(Boolean),
  purpose: compactString(value.purpose),
  preferredCategories: value.preferredCategories.map((item) => item.trim()).filter(Boolean)
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
    /(성수|서울숲|홍대|연남|합정|망원|강남|신사|압구정|잠실|여의도|익선|이태원|한남|을지로|명동|종로|혜화|신촌|건대|서촌|북촌|성북|용산|마포|성동|송파|서초|중구|종로구|강남구|성동구|마포구|용산구)/
  );
  if (matched?.[1]) {
    return matched[1];
  }

  const genericRegion = input.match(/([가-힣A-Za-z0-9]+)\s*에서/);
  return genericRegion?.[1];
};

const parseMoods = (input: string): string[] => {
  const moodKeywords = ["조용한", "부담 없는", "감성적인", "활기찬", "로맨틱한", "실내", "야외"];
  const moods = moodKeywords.filter((keyword) => input.includes(keyword.replace("한", "")));

  if ((input.includes("비") && input.includes("안 맞")) || input.includes("실내")) {
    moods.push("실내");
  }

  return [...new Set(moods)];
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
    const parsedRequest = {
      ...fallback,
      ...cleaned,
      ...preset
    };

    if (!hasPresetDateTime && fallback.dateTime && hasRelativeDateExpression(state.rawInput)) {
      parsedRequest.dateTime = fallback.dateTime;
    }

    return {
      parsedRequest
    };
  } catch (error) {
    return {
      parsedRequest: {
        ...fallback,
        ...preset
      },
      errors: [`parseUserRequest fallback used: ${getErrorMessage(error)}`]
    };
  }
};
