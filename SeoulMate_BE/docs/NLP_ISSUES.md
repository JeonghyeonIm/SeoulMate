# 자연어 입력 반영 문제 분석

> 자연어로 입력한 선호 조건이 추천 결과에 잘 반영되지 않는 원인과 개선 방향을 정리한 문서.

---

## 현상

사용자가 "카페랑 전시회 위주로 해줘", "조용하고 감성적인 분위기로" 같이 구체적인 조건을 입력해도 추천 코스가 해당 조건을 제대로 반영하지 않는 것처럼 보임.

---

## 파이프라인 요약

```
rawInput
  └─ parseUserRequestNode     → parsedRequest (region, mood, preferredCategories, ...)
       └─ fetchCandidatePlacesNode → candidatePlaces (DB 후보)
            └─ scorePlacesNode      → scoredPlaces (점수 순 정렬)
                 └─ buildCourseNode  → course (최종 코스)
```

---

## 문제 1: `preferredCategories`가 scoring에 반영되지 않음

### 현재 동작

`preferredCategories`는 파싱 후 두 곳에서만 사용됨.

| 사용 위치                        | 역할                          |
| -------------------------------- | ----------------------------- |
| `fetchCandidatePlacesNode`       | DB 키워드 검색 시 후보 필터링 |
| `buildCourseNode > resolveRoles` | 코스에 포함할 role 순서 결정  |

`scorePlacesNode`는 **`preferredCategories`를 전혀 참조하지 않음**.

### 결과

`scoringService.scorePlaces`가 계산하는 점수 항목:

```
regionScore + budgetScore + moodScore + crowdScore
+ weatherScore + distanceScore + safetyScore + purposeScore
```

카테고리 점수(`categoryScore`)가 없기 때문에, 사용자가 "카페 가고 싶어"라고 해도 카페 장소가 다른 장소보다 높은 점수를 받지 않음. 후보 80개를 카페 키워드로 뽑았더라도, scoring 단계에서 카페가 아닌 장소가 더 높은 점수를 받아 최종 코스에 포함될 수 있음.

### 영향 받는 파일

- `src/services/scoring.service.ts` — `scoreCategory` 함수 없음
- `src/graphs/nodes/scorePlaces.node.ts` — scoring 호출부

### 개선 방향

`scoring.service.ts`에 `scoreCategory` 추가.

```ts
const scoreCategory = (place: CandidatePlace, request?: ParsedRecommendationRequest): number => {
  const categories = request?.preferredCategories ?? [];
  if (!categories.length) return SCORE_WEIGHT.category * 0.6;

  const text = buildSearchText(place);
  const matchCount = categories.filter((cat) => text.includes(cat.toLowerCase())).length;
  return matchCount
    ? clamp((matchCount / categories.length) * SCORE_WEIGHT.category, SCORE_WEIGHT.category)
    : SCORE_WEIGHT.category * 0.2;
};
```

`SCORE_WEIGHT`에 `category` 가중치 추가 후, `scorePlaces` 집계에 포함시키면 됨.

---

## 문제 2: heuristic 파싱 결과가 AI 파싱 결과와 항상 합쳐짐

### 현재 동작

`parseUserRequestNode`는 두 가지 파싱을 병행함.

- **heuristic** (`parseHeuristically`): 정규식 기반, 빠르지만 부정확
- **AI** (`openaiClient.createJsonResponse`): GPT 기반, 정확하지만 heuristic과 결과가 다를 수 있음

`mergeParsedRequest`에서 두 결과를 합칠 때 `mood`와 `preferredCategories`는 무조건 합집합으로 처리됨.

```ts
// parseUserRequest.node.ts
mood: normalizeMoods([
  ...(fallback.mood ?? []),    // heuristic 결과 — 항상 포함
  ...(aiParsed?.mood ?? []),   // AI 결과 — 항상 포함
  ...(preset?.mood ?? [])
]),
preferredCategories: uniqueStrings([
  ...(fallback.preferredCategories ?? []),  // heuristic — 항상 포함
  ...(aiParsed?.preferredCategories ?? []), // AI — 항상 포함
  ...(preset?.preferredCategories ?? [])
])
```

### 결과

AI가 올바른 결과를 냈더라도, heuristic이 오판한 값이 섞여 들어감.

예시: "비 오는 날 홍대에서 실내 데이트"

- heuristic → mood: `["조용한", "감성적인"]`, categories: `["카페", "문화공간"]`
- AI → mood: `["감성적인"]`, categories: `["카페", "문화공간", "음식점"]`
- merge 결과 → mood: `["조용한", "감성적인"]`, categories: `["카페", "문화공간", "음식점"]`

이 경우는 무해하지만, heuristic이 엉뚱한 키워드를 잡으면 AI 결과가 희석됨.

### 영향 받는 파일

- `src/graphs/nodes/parseUserRequest.node.ts` — `mergeParsedRequest` 함수

### 개선 방향

`mood`와 `preferredCategories`는 AI 파싱 성공 시 AI 결과를 우선, heuristic은 보조로만 사용.

```ts
const mergeParsedRequest = (
  fallback: ParsedRecommendationRequest,
  aiParsed?: ParsedRecommendationRequest,
  preset?: ParsedRecommendationRequest
): ParsedRecommendationRequest => {
  // 명확한 값(region, budget 등)은 기존 방식 유지
  // mood/categories는 AI가 결과를 냈으면 AI 우선, 없을 때만 fallback 사용
  const baseMood = aiParsed ? (aiParsed.mood ?? []) : (fallback.mood ?? []);
  const baseCategories = aiParsed
    ? (aiParsed.preferredCategories ?? [])
    : (fallback.preferredCategories ?? []);

  return {
    region: preset?.region ?? aiParsed?.region ?? fallback.region,
    budget: preset?.budget ?? aiParsed?.budget ?? fallback.budget,
    dateTime: preset?.dateTime ?? aiParsed?.dateTime ?? fallback.dateTime,
    durationHours: preset?.durationHours ?? aiParsed?.durationHours ?? fallback.durationHours,
    mood: normalizeMoods([...baseMood, ...(preset?.mood ?? [])]),
    purpose: preset?.purpose ?? aiParsed?.purpose ?? fallback.purpose,
    preferredCategories: uniqueStrings([...baseCategories, ...(preset?.preferredCategories ?? [])])
  };
};
```

---

## 우선순위

| 순위 | 문제                                 | 영향도 | 수정 난이도 |
| ---- | ------------------------------------ | ------ | ----------- |
| 1    | `preferredCategories` scoring 미반영 | 높음   | 낮음        |
| 2    | heuristic + AI merge 오염            | 중간   | 낮음        |

문제 1이 추천 품질에 직접적인 영향을 미치므로 먼저 수정 권장.
