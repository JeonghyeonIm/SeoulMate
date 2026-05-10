const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000/api";
const outputPath = process.env.OUTPUT_PATH;

const unique = Date.now();
const credentials = {
  email: process.env.TEST_EMAIL ?? `api20_${unique}@example.com`,
  password: "password123",
  nickname: `api${String(unique).slice(-6)}`
};

const testCases = [
  ["성수", ["조용한", "부담 적은"], 30000, "half-day", "첫 데이트"],
  ["홍대", ["실내", "감성적인"], 40000, "half-day", "비 오는 날 데이트"],
  ["강남", ["활기찬", "대화하기 좋은"], 50000, "2h", "퇴근 후 데이트"],
  ["잠실", ["야경", "로맨틱한"], 60000, "half-day", "기념일 데이트"],
  ["종로", ["전통적인", "조용한"], 35000, "half-day", "첫 만남"],
  ["이태원", ["이국적인", "맛집"], 60000, "half-day", "저녁 데이트"],
  ["망원", ["편안한", "산책"], 30000, "half-day", "주말 데이트"],
  ["연남", ["감성적인", "카페"], 45000, "half-day", "대화 중심 데이트"],
  ["건대", ["활기찬", "가성비"], 35000, "2h", "가벼운 데이트"],
  ["명동", ["관광", "실내"], 50000, "half-day", "서울 구경 데이트"],
  ["북촌", ["전통적인", "산책"], 30000, "half-day", "천천히 걷는 데이트"],
  ["여의도", ["산책", "야경"], 40000, "half-day", "한강 데이트"],
  ["합정", ["조용한", "감성적인"], 35000, "half-day", "첫 데이트"],
  ["혜화", ["문화", "공연"], 50000, "half-day", "공연 전후 데이트"],
  ["신촌", ["가성비", "편안한"], 30000, "2h", "학생 데이트"],
  ["서울숲", ["산책", "카페"], 35000, "half-day", "낮 데이트"],
  ["압구정", ["세련된", "맛집"], 70000, "half-day", "기념일 데이트"],
  ["문래", ["감성적인", "문화"], 40000, "half-day", "사진 찍기 좋은 데이트"],
  ["청계천", ["산책", "부담 적은"], 25000, "2h", "가벼운 첫 만남"],
  ["DDP", ["실내", "전시"], 45000, "half-day", "전시 데이트"]
];

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }

  return body;
};

const auth = process.env.TEST_EMAIL
  ? await requestJson("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password
      })
    })
  : await requestJson("/auth/signup", {
      method: "POST",
      body: JSON.stringify(credentials)
    });

const authorization = `Bearer ${auth.accessToken}`;
const dateTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const results = [];

const startIndex = Number(process.env.START_INDEX ?? "0");
const endIndex = Number(process.env.END_INDEX ?? String(testCases.length));

for (const [index, [region, vibes, budget, duration, purpose]] of testCases.entries()) {
  if (index < startIndex || index >= endIndex) {
    continue;
  }

  const query = `${region}에서 ${budget.toLocaleString("ko-KR")}원 이하로 ${vibes.join(", ")} ${purpose} 코스 추천해줘`;
  const recommendResponse = await requestJson("/courses/recommend", {
    method: "POST",
    headers: { Authorization: authorization },
    body: JSON.stringify({
      query,
      region,
      vibes,
      budget,
      duration,
      dateTime,
      purpose
    })
  });

  const courseId = recommendResponse.courses?.[0]?.id;
  const detailResponse = courseId
    ? await requestJson(`/courses/${courseId}`, {
        headers: { Authorization: authorization }
      })
    : null;

  results.push({
    caseNo: index + 1,
    request: { query, region, vibes, budget, duration, dateTime, purpose },
    recommendResponse,
    detailResponse
  });
}

const payload = { count: results.length, results };

if (outputPath) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(payload, null, 2));
