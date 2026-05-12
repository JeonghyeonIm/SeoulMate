# 프로젝트 현황 정리

> 작성일: 2026-05-12  
> 지금까지 구현된 것과 아직 남은 작업을 한 곳에 정리한 문서.

---

## 구현 완료

### 인프라 / 설정

- Express + TypeScript 서버 부트스트랩 (app.ts, server.ts)
- PostgreSQL 연결 (pg.Pool, config/db.ts)
- 환경변수 로딩 및 검증 (config/env.ts)
- Husky + lint-staged pre-commit 훅
- ESLint + Prettier 설정

### 인증

- `POST /api/auth/signup` — 회원가입 (중복 검사, 비밀번호 해싱, 사용자 생성)

### 공공데이터 배치 파이프라인

| 잡                                   | 설명                                              |
| ------------------------------------ | ------------------------------------------------- |
| `runPublicDataSync`                  | 공공 API 원본 데이터 동기화                       |
| `runPublicDataCategoryNormalization` | rule-based 카테고리 분류 → placeFamily, placeType |
| `runAddressCoordinateRepair`         | 주소 → 좌표 지오코딩 보정                         |
| `runKakaoPlaceCategoryNormalization` | LOCALDATA 음식/카페 Kakao 매칭                    |
| `runKakaoUrlMatching`                | 비LOCALDATA 7개 데이터셋 Kakao URL 매칭           |
| `runWeatherSync`                     | 기상청 날씨 데이터 동기화                         |
| `runLivingPopulationSync`            | 서울 생활인구 데이터 동기화                       |

### Kakao URL 매칭 커버리지 (2026-05-12 기준)

| 데이터셋              | 설명                    | 성공률                  |
| --------------------- | ----------------------- | ----------------------- |
| culturalSpaceInfo     | 문화공간                | 88.7%                   |
| TbVwRestaurants       | 방문서울 음식점         | 85.4%                   |
| viewNightSpot         | 야경명소                | 82.4%                   |
| TbVwAttractions       | 관광명소                | 78.9%                   |
| TbVwNature            | 자연명소                | 78.4%                   |
| SearchParkInfoService | 공원                    | 66.9%                   |
| culturalEventInfo     | 기간제 문화행사         | ~0% (고정 장소 없음)    |
| LOCALDATA_072404      | 음식점 인허가           | LOCALDATA 잡 적용       |
| LOCALDATA_072405      | 카페 인허가             | LOCALDATA 잡 적용       |
| 여가시설 인허가       | 노래방·목욕장·당구장 등 | 별도 잡 없음, DB에 있음 |

### AI 코스 추천 시스템

**경로 A — 풀 LangGraph** (`/api/recommendations`, 레거시)

```
parseUserRequest → fetchCandidatePlaces → verifyCandidatePlaces
→ fetchContextData → scorePlaces → buildCourse
→ validateRecommendation → buildAlternativeCourse
→ generateAiExplanation → generateRiskNotice → formatRecommendationResult
```

**경로 B — API 그래프** (`/api/courses/recommend`, 현재 주 경로)

```
[LangGraph] parseUserRequest → fetchCandidatePlaces → verifyCandidatePlaces → fetchContextData → scorePlaces
[서비스 계층] buildCourseVariant × N → attachBatchExplanations → saveBuiltCourseVariant
```

### Scoring 시스템

`scoringService.scorePlaces`가 계산하는 항목:

| 항목          |  가중치 |
| ------------- | ------: |
| regionScore   |      20 |
| moodScore     |      18 |
| budgetScore   |      15 |
| crowdScore    |      12 |
| weatherScore  |      10 |
| distanceScore |      10 |
| safetyScore   |       8 |
| purposeScore  |       7 |
| **합계**      | **100** |

### Variant 시스템

mood 없을 때 기본 4개: `best`, `balanced`, `indoor`, `low-budget`  
mood 있을 때: mood variant 먼저 + `best` 마지막, 최대 4개

mood variant: `mood-quiet`, `mood-hip`, `mood-poetic`, `mood-romantic`, `mood-lively`, `mood-calm`, `mood-modern`, `mood-emotional`, `mood-nature`

### 기타

- Kakao 장소 런타임 검증 (`verifyCandidatePlacesNode`), 쿼터 초과 503 처리
- mapUrl 우선순위: `mapVerification.placeUrl` → `kakao_place_url` → `source_url`
- 코스 동선 계산 (`routeCoursePlaces` — 카카오 도보 경로)
- LLM 호출 실패 시 rule-based fallback 적용
- API 저장 정책: variant별 requestId + 장소 목록 DB 저장
- `kakaoUrlMatching.service.ts` 분리 — Kakao URL 매칭 + 메뉴 가격 크롤링 로직

---

## 미적용 / 수정 필요

### 1. preferredCategories가 scoring에 반영되지 않음 — **버그**

**파일:** `src/services/scoring.service.ts`, `src/constants/scoreWeight.ts`

사용자가 "카페랑 전시회 위주로 해줘"라고 해도 scoring 단계에서 카테고리 점수가 없어 카페가 다른 장소보다 높은 점수를 받지 못함. 후보 필터링 단계에서는 카테고리를 반영하지만 scoring에서는 무시됨.

수정 방향 (`NLP_ISSUES.md` 참고):

```ts
// SCORE_WEIGHT에 추가
category: 10;

// scoreCategory 함수 추가
const scoreCategory = (place, request) => {
  const categories = request?.preferredCategories ?? [];
  if (!categories.length) return SCORE_WEIGHT.category * 0.6;
  const text = buildSearchText(place);
  const matchCount = categories.filter((cat) => text.includes(cat.toLowerCase())).length;
  return matchCount
    ? clamp((matchCount / categories.length) * SCORE_WEIGHT.category, SCORE_WEIGHT.category)
    : SCORE_WEIGHT.category * 0.2;
};
```

### 2. heuristic + AI merge 오염 — **버그**

**파일:** `src/graphs/nodes/parseUserRequest.node.ts` (`mergeParsedRequest`, 125~145줄)

현재 `mood`와 `preferredCategories`를 heuristic과 AI 결과 무조건 합집합으로 처리함. heuristic이 엉뚱한 키워드를 잡으면 AI 결과가 희석됨.

수정 방향 (`NLP_ISSUES.md` 참고):

```ts
// AI 파싱 성공 시 AI 우선, heuristic은 보조
const baseMood = aiParsed ? (aiParsed.mood ?? []) : (fallback.mood ?? []);
const baseCategories = aiParsed
  ? (aiParsed.preferredCategories ?? [])
  : (fallback.preferredCategories ?? []);
```

---

### 3. 메뉴 가격 배치 잡 미구현

`kakaoUrlMatching.service.ts`에 `processMenuPriceFetchBatch`, `fetchKakaoMenuPrice` 구현 완료.  
DB 마이그레이션(`20260512_add_menu_price.sql`)도 작성 완료.  
하지만 이를 실행하는 **배치 잡 파일(`runMenuPriceFetch.ts`)이 없음**.  
`package.json`에도 스크립트 미등록.

---

### 4. culturalEventInfo 활용 전략 미결정

기간제 행사 데이터라 Kakao URL 매칭이 ~0%. 현재 DEFAULT_SOURCE_DATASETS에 포함되어 후보로 조회되지만, 유효 장소가 거의 없어 추천 품질에 기여하지 못함.

선택지:

- DEFAULT_SOURCE_DATASETS에서 제외하고 별도 조건(기간 내 행사인 경우만)으로 조회
- 또는 그대로 두되 행사 기간 필터 추가

---

### 5. 미커밋 파일 처리

아래 파일들이 git에 추가되지 않은 상태:

| 파일                                            | 내용                                             |
| ----------------------------------------------- | ------------------------------------------------ |
| `db/migrations/20260512_add_course_weather.sql` | recommendation_requests.course_weather 컬럼 추가 |
| `db/migrations/20260512_add_menu_price.sql`     | public_data 메뉴 가격 컬럼 3개 추가              |
| `docs/NLP_ISSUES.md`                            | NLP 파싱 문제 분석 문서                          |
| `src/services/kakaoUrlMatching.service.ts`      | Kakao URL 매칭 서비스 분리                       |

---

### 6. 향후 개선 방향 (단기 우선순위 낮음)

아래는 `AI_COURSE_RECOMMENDATION.md`에 기록된 방향으로, 지금 당장은 아니지만 추천 품질 향상에 기여할 수 있음.

| 항목                  | 내용                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| food 하위 타입        | "파스타", "고기", "브런치"처럼 구체적 요청 시 placeType까지 정렬에 반영            |
| 목적별 role 미세 조정 | 첫 데이트: cafe+culture+walk, 가족: attraction+walk+food, 친구: food+activity+cafe |
| 설명에 반영 근거 노출 | "카페 요청을 우선 반영하고 저녁 시간대라 식사를 앞에 배치했습니다" 형태            |
| 추천 품질 로그        | parsedRequest, requestedRoles, finalRoles, role match 여부, fallback 여부 기록     |
| 카테고리 확장         | 브런치, 오마카세, 팝업, 편집샵, 서점, 소품샵 등                                    |

---

## 즉시 수정 권장 순서

1. **preferredCategories scoring 반영** (버그, 추천 품질 직접 영향)
2. **heuristic/AI merge 개선** (버그, 파싱 오염 방지)
3. **미커밋 파일 커밋** (DB 마이그레이션 포함)
4. **runMenuPriceFetch 배치 잡 구현** (구현 절반 완료 상태)
5. **culturalEventInfo 처리 방향 결정**
