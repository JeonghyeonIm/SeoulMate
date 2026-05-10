import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.OPENAI_API_KEY ||= "skip";
process.env.KAKAO_REST_API_KEY ||= "";

const { parseUserRequestNode } = require("../dist/graphs/nodes/parseUserRequest.node");
const { fetchCandidatePlacesNode } = require("../dist/graphs/nodes/fetchCandidatePlaces.node");
const { scorePlacesNode } = require("../dist/graphs/nodes/scorePlaces.node");
const { buildCourseNode } = require("../dist/graphs/nodes/buildCourse.node");
const { db } = require("../dist/config/db");

const args = process.argv.slice(2);
const filePath = args.find((arg) => !arg.startsWith("--"));
const parseOnly = args.includes("--parse-only");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
const offsetArg = args.find((arg) => arg.startsWith("--offset="));
const offset = offsetArg ? Number(offsetArg.split("=")[1]) : 0;

if (!filePath) {
  console.error(
    "Usage: node scripts/checkUserQueries.mjs <User_Query.txt> [--parse-only] [--limit=50]"
  );
  process.exit(1);
}

const hasAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword));

const regionHints = [
  "강남",
  "역삼",
  "신사",
  "압구정",
  "청담",
  "잠실",
  "송파",
  "석촌호수",
  "성수",
  "서울숲",
  "홍대",
  "연남동",
  "연남",
  "합정",
  "망원",
  "상수",
  "여의도",
  "문래",
  "이태원",
  "명동",
  "을지로",
  "DDP",
  "종로",
  "익선동",
  "북촌",
  "서촌",
  "광화문",
  "혜화",
  "건대",
  "신촌",
  "노원",
  "사당",
  "왕십리",
  "한양대",
  "옥수",
  "용산",
  "양재",
  "고속터미널",
  "한강",
  "낙산공원",
  "잠원"
];

const moodHints = [
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

const checks = [
  {
    name: "nightlife",
    triggers: [
      "술집",
      "술 한잔",
      "2차",
      "호프",
      "호프집",
      "주점",
      "포차",
      "맥주",
      "와인",
      "칵테일",
      "이자카야",
      "펍",
      "막걸리",
      "전통주점",
      "하이볼",
      "루프탑바",
      "감성주점"
    ],
    categoryHints: ["술집", "클럽"]
  },
  {
    name: "karaoke",
    triggers: ["노래방", "노래연습장", "코인노래방"],
    categoryHints: ["노래방"]
  },
  {
    name: "camping",
    triggers: ["캠핑", "글램핑", "야영", "바베큐"],
    categoryHints: ["캠핑장"]
  },
  {
    name: "amusement",
    triggers: ["놀이공원", "놀이시설", "테마파크", "롯데월드", "어드벤처", "워터파크"],
    categoryHints: ["놀이시설"]
  },
  {
    name: "activity",
    triggers: [
      "방탈출",
      "보드게임",
      "찜질방",
      "볼링",
      "당구",
      "만화카페",
      "공방",
      "원데이클래스",
      "향수",
      "도자기",
      "클라이밍",
      "VR",
      "아케이드",
      "실내 놀거리",
      "액티비티",
      "체험"
    ],
    categoryHints: ["실내놀거리"]
  }
];

const lines = fs
  .readFileSync(filePath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((line) => line !== "User_Query")
  .slice(Number.isFinite(offset) ? offset : 0)
  .slice(0, Number.isFinite(limit) ? limit : undefined);

const inferRegion = (query) => regionHints.find((region) => query.includes(region)) ?? "서울";
const inferMood = (query) => {
  const moods = moodHints.filter((mood) => query.includes(mood));
  return moods.length ? moods : ["활기찬"];
};

const presetFor = (query) => ({
  region: inferRegion(query),
  budget: query.includes("예산 상관없이") ? 200001 : query.includes("5만원") ? 50000 : 80000,
  durationHours: hasAny(query, ["하루", "반나절", "놀이공원", "롯데월드", "캠핑", "글램핑"])
    ? 6
    : 4,
  mood: inferMood(query)
});

const courseText = (state) => {
  const candidatesById = new Map((state.candidatePlaces ?? []).map((place) => [place.id, place]));
  return (state.course?.places ?? [])
    .map((place) => {
      const candidate = candidatesById.get(place.placeId);
      return [
        place.title,
        place.category,
        place.address,
        candidate?.sourceDataset,
        JSON.stringify(candidate?.metadata ?? {})
      ].join(" ");
    })
    .join(" ")
    .toLowerCase();
};

const checkParseMisses = (query, parsedRequest) => {
  const categories = parsedRequest?.preferredCategories ?? [];
  const categoryText = categories.join("|");
  const misses = [];

  for (const check of checks) {
    if (
      hasAny(query, check.triggers) &&
      !check.categoryHints.some((hint) => categoryText.includes(hint))
    ) {
      misses.push(check.name);
    }
  }

  if (
    hasAny(query, ["술 못", "술못", "술 안", "술안"]) &&
    !hasAny(
      query,
      checks[0].triggers.filter((trigger) => !trigger.includes("술"))
    ) &&
    (categoryText.includes("술집") || categoryText.includes("클럽"))
  ) {
    misses.push("noAlcoholFalsePositive");
  }

  return misses;
};

const checkCourseMisses = (query, state) => {
  const text = courseText(state);
  const misses = [];
  const expectedByName = {
    nightlife: [
      "술집",
      "주점",
      "호프",
      "포차",
      "맥주",
      "와인",
      "칵테일",
      "이자카야",
      "클럽",
      "bar",
      "pub"
    ],
    karaoke: ["노래방", "노래연습장", "코인노래방"],
    camping: ["캠핑", "글램핑", "야영", "바베큐"],
    amusement: ["놀이공원", "놀이시설", "테마파크", "롯데월드", "어드벤처", "워터파크"],
    activity: [
      "방탈출",
      "보드게임",
      "찜질방",
      "볼링",
      "당구",
      "만화카페",
      "공방",
      "원데이클래스",
      "클라이밍",
      "아케이드"
    ]
  };

  for (const check of checks) {
    if (hasAny(query, check.triggers) && !hasAny(text, expectedByName[check.name] ?? [])) {
      misses.push(check.name);
    }
  }

  return misses;
};

const run = async () => {
  const parseMisses = [];
  const graphFailures = [];
  const courseMisses = [];
  const startedAt = Date.now();

  for (let index = 0; index < lines.length; index += 1) {
    const query = lines[index];
    const baseState = {
      rawInput: query,
      parsedRequest: presetFor(query),
      warnings: [],
      errors: []
    };
    const state1 = { ...baseState, ...(await parseUserRequestNode(baseState)) };
    const misses = checkParseMisses(query, state1.parsedRequest);
    if (misses.length) {
      parseMisses.push({
        index: index + 1,
        misses,
        query,
        categories: state1.parsedRequest?.preferredCategories ?? []
      });
    }

    if (!parseOnly) {
      const state2 = { ...state1, ...(await fetchCandidatePlacesNode(state1)) };
      const state3 = { ...state2, ...(await scorePlacesNode(state2)) };
      const state4 = { ...state3, ...(await buildCourseNode(state3)) };
      const placeCount = state4.course?.places?.length ?? 0;
      const candidateCount = state4.candidatePlaces?.length ?? 0;
      if (!candidateCount || !placeCount || state4.errors?.length) {
        graphFailures.push({
          index: index + 1,
          query,
          candidateCount,
          placeCount,
          errors: state4.errors ?? []
        });
      }
      const courseMiss = checkCourseMisses(query, state4);
      if (courseMiss.length) {
        courseMisses.push({
          index: index + 1,
          misses: courseMiss,
          query,
          places: state4.course?.places?.map((place) => place.title) ?? []
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        total: lines.length,
        parseOnly,
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        parseMissCount: parseMisses.length,
        graphFailureCount: graphFailures.length,
        courseMissCount: courseMisses.length,
        parseMisses: parseMisses.slice(0, 40),
        graphFailures: graphFailures.slice(0, 40),
        courseMisses: courseMisses.slice(0, 40)
      },
      null,
      2
    )
  );
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!parseOnly) {
      await db.end().catch(() => undefined);
    }
  });
