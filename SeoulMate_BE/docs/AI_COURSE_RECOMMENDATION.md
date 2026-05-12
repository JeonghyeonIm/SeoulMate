# AI 코스 추천 설계 문서

## 목적

SeoulMate의 AI 코스 추천은 사용자의 자연어 요청을 서울 공공데이터와 Kakao 검증 데이터에 연결해 실제로 방문 가능한 장소 조합을 만드는 기능이다.

핵심 목표:

- 지역, 시간, 예산, 분위기, 목적, 명시 카테고리를 최대한 반영한다.
- 공공데이터와 Kakao 파싱/검증 결과를 우선 활용해 후보 장소의 신뢰도를 높인다.
- 코스는 단순 점수 나열이 아니라 시간대, 소요 시간, 이동 부담, 날씨, 혼잡도를 고려한 순서 있는 일정이다.
- 명시 카테고리 요청은 기본 추천 정책보다 우선한다.
- 술집·클럽 등은 명시적으로 요청한 경우에만 포함한다.
- AI는 자연어 파싱과 설명 생성에만 관여하고, 장소 선택은 DB 후보 안에서만 한다.

---

## 시스템 파일 구조

```
src/
├── graphs/
│   ├── courseRole.ts                        # 공유 role 상수 및 유틸
│   ├── recommendation.graph.ts              # LangGraph 그래프 정의 (3개)
│   ├── recommendation.state.ts             # 그래프 상태 타입 정의
│   └── nodes/
│       ├── parseUserRequest.node.ts         # LLM 자연어 파싱
│       ├── fetchCandidatePlaces.node.ts     # 후보 장소 DB 조회
│       ├── verifyCandidatePlaces.node.ts    # Kakao 장소 검증
│       ├── fetchContextData.node.ts         # 날씨/혼잡도 실시간 데이터
│       ├── scorePlaces.node.ts              # 장소 점수 계산
│       ├── buildCourse.node.ts              # 코스 role 구성 + 장소 선택
│       ├── validateRecommendation.node.ts   # 코스 검증
│       ├── buildAlternativeCourse.node.ts   # 검증 실패 시 대안 코스
│       ├── generateAiExplanation.node.ts    # LLM 설명 생성
│       ├── generateRiskNotice.node.ts       # 리스크 알림 생성
│       └── formatRecommendationResult.node.ts
├── services/
│   └── recommendation.service.ts            # API 경로 variant 빌더 + 저장
└── jobs/
    ├── runPublicDataSync.ts                  # 공공데이터 원본 동기화
    ├── runPublicDataCategoryNormalization.ts # rule-based 카테고리 분류
    ├── runKakaoPlaceCategoryNormalization.ts # LOCALDATA용 Kakao 매칭 (음식/카페)
    ├── runKakaoUrlMatching.ts               # 비LOCALDATA 7개 데이터셋 Kakao URL 매칭
    ├── runAddressCoordinateRepair.ts        # 주소 → 좌표 지오코딩 보정
    ├── runWeatherSync.ts                    # 날씨 데이터 동기화
    └── runLivingPopulationSync.ts           # 생활인구 데이터 동기화
```

`courseRole.ts`는 `buildCourse.node.ts`와 `recommendation.service.ts` 양쪽에서 공통으로 import한다. role 키워드·상수·유틸이 모두 이 파일에 있다.

---

## 배치 데이터 파이프라인

추천 시스템이 사용하는 `public_data` 테이블은 여러 배치 잡을 통해 구축된다.

### 데이터 흐름

```
공공 API 원본 데이터
  → runPublicDataSync              (원본 동기화)
  → runPublicDataCategoryNormalization  (rule-based 분류 → placeFamily, placeType)
  → runAddressCoordinateRepair     (주소 → 좌표 보정)
  → runKakaoPlaceCategoryNormalization  (LOCALDATA 음식/카페 → Kakao 매칭)
  → runKakaoUrlMatching            (비LOCALDATA 7개 데이터셋 → Kakao URL 확보)
```

### npm 스크립트

| 스크립트                             | 설명                                    |
| ------------------------------------ | --------------------------------------- |
| `npm run sync:public-data`           | 공공데이터 원본 동기화                  |
| `npm run normalize:categories`       | rule-based 카테고리 분류                |
| `npm run normalize:kakao-categories` | LOCALDATA 음식/카페 Kakao 매칭          |
| `npm run match:kakao-urls`           | 비LOCALDATA 7개 데이터셋 Kakao URL 매칭 |
| `npm run repair:coordinates`         | 주소 → 좌표 지오코딩 보정               |

### runKakaoUrlMatching — 상세

`LOCALDATA_072404`(음식점 인허가)·`LOCALDATA_072405`(카페 인허가) 외 7개 데이터셋은 기존 Kakao 정규화 잡의 적용 범위 밖이었다. `runKakaoUrlMatching`은 이 데이터셋을 대상으로 Kakao 장소 keyword search를 통해 `kakao_place_url`을 확보한다.

대상 데이터셋 및 실행 후 커버리지 (2026-05-12 기준):

| 데이터셋                | 설명              |  전체 | Kakao URL 확보 | 성공률 |
| ----------------------- | ----------------- | ----: | -------------: | -----: |
| `culturalSpaceInfo`     | 문화공간          | 1,052 |            933 |  88.7% |
| `TbVwRestaurants`       | 방문서울 음식점   | 1,247 |          1,065 |  85.4% |
| `viewNightSpot`         | 야경 명소         |    51 |             42 |  82.4% |
| `TbVwAttractions`       | 관광명소          |   470 |            371 |  78.9% |
| `TbVwNature`            | 자연명소          |   148 |            116 |  78.4% |
| `SearchParkInfoService` | 공원              |   133 |             89 |  66.9% |
| `culturalEventInfo`     | 문화행사 (기간제) | 3,907 |             ~0 |     0% |

`culturalEventInfo`는 전시·공연 등 기간제 행사 이름이라 Kakao에 고정 장소로 등록되어 있지 않아 매칭이 거의 되지 않는다.

**동작 방식:**

1. **Phase 1 — 지오코딩**: `TbVwRestaurants`, `TbVwAttractions`, `TbVwNature`에서 좌표가 없는 레코드를 Kakao 주소 검색으로 보정한다.
2. **Phase 2 — Kakao URL 매칭**: 장소 제목 + 지역명으로 keyword search 후 신뢰도 점수 45 이상인 최고 결과를 선택한다. `kakao_place_url`, `kakao_place_name`, `kakao_category_name` 필드를 업데이트하며, 기존 `place_family`·`place_type` 분류는 덮어쓰지 않는다.
3. 이미 처리된 레코드는 `kakao_checked_at IS NULL` 조건으로 건너뛴다.

**기존 `runKakaoPlaceCategoryNormalization`과의 차이:**

|                      | runKakaoPlaceCategoryNormalization | runKakaoUrlMatching |
| -------------------- | ---------------------------------- | ------------------- |
| 대상 데이터셋        | LOCALDATA_072404, LOCALDATA_072405 | 7개 비LOCALDATA     |
| 최소 신뢰도          | 74                                 | 45                  |
| 카테고리 제한        | 음식점·카페만                      | 제한 없음           |
| placeFamily 업데이트 | O                                  | X (URL만 확보)      |

**환경 변수:**

```bash
KAKAO_URL_MATCH_LIMIT=300          # 배치당 처리 수 (기본 200)
KAKAO_URL_MATCH_REPEAT=true        # 전체 처리 완료까지 반복
KAKAO_URL_MATCH_MAX_BATCHES=10     # 최대 배치 수 제한 (0 = 무제한)
KAKAO_URL_MATCH_DATASETS=culturalSpaceInfo,SearchParkInfoService  # 특정 데이터셋만 처리
```

### mapUrl 우선순위

후보 장소의 카카오맵 링크는 다음 우선순위로 결정된다:

```
mapVerification?.placeUrl  (런타임 Kakao 검증 결과)
  ?? kakao_place_url        (배치 매칭 결과 — DB)
  ?? source_url             (원본 공공데이터 URL)
```

배치 매칭이 완료된 데이터셋은 대부분 `kakao_place_url`이 채워져 있어 지도보기 링크가 정상 작동한다.

---

## 두 가지 실행 경로

추천 로직은 두 가지 경로로 실행된다.

### 경로 A — 풀 LangGraph (`runRecommendationGraph`)

레거시 `/api/recommendations` 엔드포인트에서 사용한다. 그래프 전체를 실행한다.

```
START
  → parseUserRequest       (LLM #1: 자연어 → 구조화 요청)
  → fetchCandidatePlaces
  → verifyCandidatePlaces
  → fetchContextData
  → scorePlaces
  → buildCourse
  → validateRecommendation
  → buildAlternativeCourse
  → validateRecommendationFinal
  → generateAiExplanation  (LLM #2: 단일 코스 설명 생성)
  → generateRiskNotice
  → formatRecommendationResult
END
```

결과로 단일 `RecommendationCourse` + `AiExplanation`을 반환한다.

### 경로 B — API 그래프 (`runRecommendationGraphForApi`)

현재 `/api/courses/recommend` 엔드포인트에서 사용한다. 그래프는 `scorePlaces`에서 중단하고, 이후 로직은 서비스 계층에서 처리한다.

```
[LangGraph apiBaseGraph]
START
  → parseUserRequest       (LLM #1: 자연어 → 구조화 요청)
  → fetchCandidatePlaces
  → verifyCandidatePlaces
  → fetchContextData
  → scorePlaces
END

[recommendation.service.ts]
  → buildRecommendationVariants()    (최대 4개 variant 결정)
  → buildCourseVariant() × N         (variant별 코스 rule-based 빌드)
  → attachBatchExplanations()        (LLM #2 병렬: variant별 설명 생성)
  → saveBuiltCourseVariant() × N     (variant별 DB 저장)
  → 응답 포맷팅
```

경로 B에서 LLM은 두 번 호출된다:

1. `parseUserRequestNode` — 자연어를 구조화 요청으로 변환
2. `generateAiCourseExplanation` — variant별 설명 생성 (최대 4개 병렬 호출)

---

## API 스펙

```
POST /api/courses/recommend
```

요청 바디:

```json
{
  "query": "오늘 저녁 성수에서 카페랑 식당이랑 공원 넣어서 조용한 데이트 코스 추천해줘",
  "region": "성수",
  "vibes": ["조용한"],
  "budget": 40000,
  "duration": "gt-2h-lte-4h",
  "dateTime": "2026-05-12T18:30:00+09:00",
  "purpose": "데이트"
}
```

구조화 필드가 있으면 자연어 추론값보다 우선 사용한다. `dateTime`이 body에 있으면 "오늘 저녁"보다 body의 `dateTime`을 쓴다.

`duration` 변환:

| API duration     | 내부 durationHours |
| ---------------- | -----------------: |
| `lte-2h`         |                  2 |
| `gt-2h-lte-4h`   |                  4 |
| `gt-4h-lte-6h`   |                  6 |
| `gt-6h-lte-8h`   |                  8 |
| `gt-8h-lte-10h`  |                 10 |
| `gt-10h-lte-12h` |                 12 |
| `gt-12h`         |                 13 |

`budget` 200001은 내부에서 "200,000원 초과" 오픈 예산을 뜻한다.

---

## 단계별 상세

### 1. 요청 정규화 (서비스 계층)

`buildStructuredRecommendationInput()`이 body 필드를 내부 `ParsedRecommendationRequest`로 변환한다.

```ts
interface ParsedRecommendationRequest {
  region?: string;
  budget?: number;
  dateTime?: string;
  durationHours?: number;
  mood?: string[];
  purpose?: string;
  preferredCategories?: string[];
}
```

`vibes`는 허용 목록(`ALLOWED_MOODS`)을 통해 정규화한다. "로맨스" → "로맨틱", "낭만" → "낭만적인" 같은 유사어를 매핑한다.

### 2. 자연어 파싱 (`parseUserRequestNode`, LLM #1)

LLM이 `rawInput` 자연어에서 지역·예산·시간·분위기·목적·명시 카테고리를 추출해 `parsedRequest`를 보강한다.

파싱 대상:

- 지역: 성수, 홍대, 연남, 강남역, 잠실, 종로 등
- 예산: "3만원", "4만 원 이하", "예산 넉넉하게"
- 시간: "오늘 저녁", "내일 오후", "18시", "3시간"
- 분위기: 조용한, 감성적인, 힙한, 로맨틱, 자연친화적
- 목적: 데이트, 첫 데이트, 친구랑, 혼자, 가족
- 명시 카테고리: 카페, 식당, 맛집, 공원, 전시, 문화공간, 노래방, 술집, 방탈출 등

구조화 요청 필드가 이미 있으면 LLM 결과를 덮어쓰지 않는다.

### 3. 후보 장소 조회 (`fetchCandidatePlacesNode`)

`preferredCategories`, `region`, `sourceDataset`을 기준으로 공공데이터 DB에서 후보를 조회한다.

기본 후보 데이터셋:

- `culturalEventInfo`, `culturalSpaceInfo`
- `TbVwRestaurants`
- `TbVwNature`, `TbVwAttractions`
- `SearchParkInfoService`
- `LOCALDATA_072404`, `LOCALDATA_072405`
- `viewNightSpot`

카테고리 요청이 있으면 관련 데이터셋을 우선 조회한다:

| 요청               | 우선 데이터셋                                             |
| ------------------ | --------------------------------------------------------- |
| 카페, 음식, 식당   | `TbVwRestaurants`, `LOCALDATA_072404`, `LOCALDATA_072405` |
| 전시, 문화, 박물관 | `culturalEventInfo`, `culturalSpaceInfo`                  |
| 산책, 공원, 자연   | `SearchParkInfoService`, `TbVwNature`                     |
| 관광, 명소, 야경   | `TbVwAttractions`, `viewNightSpot`                        |

조회 결과는 `CandidatePlace` 타입으로 변환한다. Kakao 정규화 필드가 DB에 있으면 함께 매핑한다:

```ts
interface CandidatePlace {
  id: number;
  title: string;
  category: string;
  placeFamily?: string; // Kakao 정규화 대분류 (food, cafe, walk, ...)
  placeType?: string; // Kakao 정규화 중분류
  placeSubtype?: string; // Kakao 정규화 소분류
  kakaoCategoryName?: string; // Kakao 카테고리 전체 경로
  kakaoCategoryGroupName?: string;
  mapUrl?: string; // kakaoPlaceUrl 우선, 없으면 sourceUrl
  sourceUrl?: string;
  // ... 좌표, 비용, 태그 등
}
```

### 4. Kakao 검증 (`verifyCandidatePlacesNode`)

공공데이터만으로는 업종·운영 여부가 불명확한 경우가 많다. Kakao 지도 API로 장소를 검증하고 `mapVerification`을 업데이트한다.

한도 초과 시 예외를 처리하고 경고를 추가한다.

### 5. 컨텍스트 데이터 조회 (`fetchContextDataNode`)

실시간 날씨와 혼잡도 데이터를 가져온다.

- 날씨: 기상청 초단기·단기·중기 예보, 또는 도시 데이터 API
- 혼잡도: 서울 생활인구 또는 도시 데이터 crowdLevel

날씨 출처 우선순위: `ultraShortTerm` > `shortTerm` > `cityData` > `mediumTerm`

### 6. 점수 계산 (`scorePlacesNode`)

각 후보 장소에 점수를 매긴다. 주요 기준:

| 기준          | 설명                                          |
| ------------- | --------------------------------------------- |
| 지역 적합도   | 요청 지역과 `region`, `address`, `title` 매칭 |
| 예산 적합도   | 장소 예상 비용이 요청 예산 이내인지           |
| 분위기 적합도 | mood와 장소 텍스트/카테고리 신호 일치도       |
| 날씨 적합도   | 비 예보 시 야외 감점, 실내 가산               |
| 혼잡도        | 붐빔 수준에 따라 가산/감산                    |
| 이동 거리     | 기준 좌표 또는 이전 장소에서의 거리           |
| Kakao 검증    | 검증된 장소 가산                              |

분위기별 선호 신호:

| 분위기           | 선호 키워드                                            |
| ---------------- | ------------------------------------------------------ |
| 조용한, 고즈넉한 | 궁, 한옥, 북촌, 서촌, 공원, 산책, 박물관, 미술관, 서점 |
| 힙한             | 성수, 홍대, 연남, 편집샵, 팝업, 갤러리, 복합문화공간   |
| 로맨틱, 낭만적인 | 야경, 한강, 전망, 공원, 산책, 카페, 갤러리             |
| 감성적인         | 카페, 갤러리, 전시, 서점, 디저트, 공간                 |
| 자연친화적       | 공원, 산책, 숲, 한강, 야외, 둘레길                     |
| 활기찬           | 거리, 시장, 맛집, 관광, 홍대, 명동, 강남               |
| 현대적인         | DDP, 디자인, 복합, 미술관, 전시, 갤러리                |

---

## Role 시스템

### CourseRole 타입

```ts
type CourseRole =
  | "cafe"
  | "culture"
  | "walk"
  | "food"
  | "nightlife"
  | "karaoke"
  | "activity"
  | "camping"
  | "amusement"
  | "attraction";
```

`courseRole.ts`에 모든 키워드 배열, role 매핑, 유틸 함수가 정의되어 있다. `buildCourse.node.ts`와 `recommendation.service.ts` 양쪽에서 이 파일을 import한다.

### 카테고리 → role 승격

`preferredCategories`는 단순 검색 키워드가 아니라 코스 role로 승격된다. `requestedRolesFromCategories()`가 처리하며, 하나의 카테고리가 여러 role에 매칭될 수 있다(`if`, not `else if`).

| 자연어/카테고리                                      | role                       |
| ---------------------------------------------------- | -------------------------- |
| 카페, 커피, 디저트, 베이커리                         | `cafe`                     |
| 음식, 식사, 맛집, 식당, 레스토랑, 한식, 양식, 일식   | `food`                     |
| 산책, 공원, 자연, 숲, 한강, 야외, 하천, 둘레길       | `walk`                     |
| 문화, 전시, 공연, 박물관, 미술관, 공간               | `culture`                  |
| 관광, 명소, 야경                                     | `attraction`               |
| 술집, 주점, 호프, 포차, 와인바, 칵테일바, 재즈바, 펍 | `nightlife`                |
| 노래방, 노래연습장, 코인노래방                       | `karaoke`                  |
| 방탈출, 보드게임, 볼링, 당구, 공방, 원데이클래스, VR | `activity`                 |
| 캠핑, 야영, 글램핑, 바베큐, 피크닉                   | `camping`                  |
| 놀이공원, 테마파크, 워터파크, 어드벤처               | `amusement`                |
| 실내                                                 | `cafe` + `culture` (둘 다) |

### placeFamily 우선 사용

장소의 role을 추론할 때는 `placeFamily`를 먼저 확인한다. `placeFamily`가 있으면 키워드 매칭보다 우선한다.

```ts
const PLACE_FAMILY_TO_ROLE: Record<string, CourseRole> = {
  food: "food",
  cafe: "cafe",
  culture: "culture",
  walk: "walk",
  park: "walk",
  nightlife: "nightlife",
  bar: "nightlife",
  karaoke: "karaoke",
  activity: "activity",
  camping: "camping",
  amusement: "amusement",
  attraction: "attraction"
};
```

role 추론 우선순위:

1. `placeFamily` (Kakao 정규화 대분류)
2. `kakaoCategoryName`, `kakaoCategoryGroupName`, `placeType`, `placeSubtype` 키워드
3. `category`, `title`, `tags`, `metadata` 키워드

### 기본 role 순서

시간대에 따라 기본 순서가 달라진다.

18시 이전 (KST):

```json
["cafe", "food", "walk", "culture", "attraction"]
```

18시 이후 (KST):

```json
["food", "cafe", "walk", "culture", "attraction"]
```

저녁이라도 `nightlife`는 자동 추가하지 않는다.

### 장소 개수 (duration 기반)

| durationHours | min | max |
| ------------: | --: | --: |
|        `<= 2` |   1 |   2 |
|        `<= 4` |   2 |   3 |
|        `<= 6` |   3 |   4 |
|        `<= 8` |   4 |   5 |
|       `<= 10` |   5 |   6 |
|       `<= 12` |   6 |   7 |
|        `> 12` |   7 |   8 |

명시 요청 role 개수가 max보다 많으면 max를 늘려 명시 요청을 보존한다.

### 동일 role 중복

같은 role은 최대 2개까지 허용한다. 카페 3개짜리 코스는 만들지 않는다. 이 제한은 role 배열 생성 단계와 장소 선택 단계 모두에서 적용한다.

---

### 코스 role 구성 예시

```text
오늘 오후 성수에서 4시간 조용한 데이트
→ dateTime 15:00, durationHours 4, max 3, preferredCategories []
→ ["cafe", "food", "walk"]
```

```text
오늘 저녁 성수에서 4시간 조용한 데이트
→ dateTime 18:30, durationHours 4, max 3, preferredCategories []
→ ["food", "cafe", "walk"]
```

```text
카페랑 식당이랑 공원, 전시까지 넣어줘 (4시간 max=3)
→ 명시 요청 4개 보존
→ ["cafe", "food", "walk", "culture"]
```

---

## Variant 시스템

API 경로(경로 B)에서는 최대 4개 variant 코스를 동시에 만들어 반환한다.

### 기본 variant (mood 없을 때)

```
best, balanced, indoor, low-budget
```

### mood variant

mood가 있으면 mood variant를 우선 생성하고 `best`를 마지막에 붙인다. 최대 4개.

| mood       | recommendationType |
| ---------- | ------------------ |
| 조용한     | `mood-quiet`       |
| 힙한       | `mood-hip`         |
| 낭만적인   | `mood-poetic`      |
| 로맨틱     | `mood-romantic`    |
| 활기찬     | `mood-lively`      |
| 고즈넉한   | `mood-calm`        |
| 현대적인   | `mood-modern`      |
| 감성적인   | `mood-emotional`   |
| 자연친화적 | `mood-nature`      |

### variant별 동작 차이

| variant      | 동작                                             |
| ------------ | ------------------------------------------------ |
| `best`       | 기본 점수 기준 최적 코스                         |
| `balanced`   | 이전 장소에서 가까운 후보 우선 선택              |
| `indoor`     | 실내 장소만 허용 (야외 제외)                     |
| `low-budget` | 예산의 85% 이내로 제한하고 저비용 순 정렬        |
| `short-walk` | `balanced`와 동일하게 이동 거리 최소화 우선 선택 |
| `mood-*`     | mood affinity 점수 우선 정렬 + 해당 분위기 필터  |

variant끼리 장소 중복이 50% 이상이면 해당 variant는 건너뛴다.

### 비용 기본값 (role별)

| role       | 기본 비용 |
| ---------- | --------: |
| walk       |         0 |
| cafe       |     9,000 |
| food       |    15,000 |
| culture    |    12,000 |
| attraction |     8,000 |
| nightlife  |    18,000 |
| karaoke    |    12,000 |
| activity   |    18,000 |
| camping    |    20,000 |
| amusement  |    30,000 |

공공데이터 metadata에 입장료/이용료가 있으면 그 값을 우선 사용한다.

---

## LLM 호출

### LLM #1 — 자연어 파싱 (`parseUserRequestNode`)

- 모델: OpenAI (structured output)
- 입력: `rawInput` 자연어 문자열
- 출력: `ParsedRecommendationRequest` 보강값
- 구조화 요청 필드가 이미 있으면 LLM 결과로 덮어쓰지 않는다.

### LLM #2 — 설명 생성

**경로 A** (`generateAiExplanationNode`):

- 단일 코스에 대해 1회 호출
- `maxOutputTokens: 900`
- 입력: `parsedRequest`, `course`, `contextData`, `scoredPlaces[:8]`

**경로 B** (`generateAiCourseExplanation` in `attachBatchExplanations`):

- variant별로 병렬 호출 (`Promise.all`)
- `maxOutputTokens: 600` (단일 코스이므로 더 짧게)
- 입력: `parsedRequest`, `variant.course`, `contextData`, `scoredPlaces[:8]`
- 호출 실패 시 variant별 독립 fallback 적용 (다른 variant에 영향 없음)

### 설명 생성 지침

```
- 내부적으로만 코스가 조건에 맞는지 점검하고 추론 과정은 출력하지 않는다.
- course 안의 장소만 언급하고 AI가 임의 장소를 추가하지 않는다.
- 카페/문화/산책/식사 등 서로 다른 역할의 흐름을 강조한다.
- 장소 순서와 이동 동선을 함께 고려한다.
- 첫 만남 적합도, 날씨/혼잡도 반영, 예산 적합성, 대체 안내를 짧게 포함한다.
```

설명 스키마:

```ts
{
  summary: string;              // 코스 전체 요약 (사용자에게 표시)
  reason: string;               // 선택 이유
  riskNotice?: string;          // 날씨·혼잡도 리스크
  alternativeSuggestion?: string; // 대안 안내
}
```

### LLM fallback

두 경로 모두 LLM 호출 실패 시 rule-based fallback을 사용한다.

- 경로 A: `fallbackExplanation(state)` — 지역·예산·날씨 데이터 기반 템플릿
- 경로 B: `fallbackVariantExplanation(state, variant)` — variant 제목과 예상 비용 기반 템플릿

---

## 코스 검증 (경로 A)

코스 생성 후 `validateRecommendationNode`가 검증한다.

검증 항목:

- 최소 장소 개수 충족 여부
- 예산 초과 여부
- 요청 지역 포함 여부
- 이동 시간이 과도하게 긴 장소 여부
- 비 예보가 있는데 야외 장소가 포함되어 있는지

검증 실패가 치명적이면 `buildAlternativeCourseNode`에서 대안 코스를 만들고 다시 검증한다. 치명적이지 않으면 warning 또는 risk notice로 응답한다.

---

## 술 관련 처리

- 사용자가 명시적으로 요청한 경우에만 `nightlife` role을 포함한다.
- 시간대가 저녁·밤이라는 이유만으로 자동 포함하지 않는다.
- "술 못 마셔", "술 안 마셔", "술집 빼고" 같은 부정 표현이 있으면 포함하지 않는다.

예시:

```text
오늘 저녁 홍대 데이트 코스 → ["food", "cafe", "walk"]  (nightlife 없음)
오늘 저녁 홍대에서 2차 술집 포함해서 → ["nightlife", "food", "cafe"]
```

---

## Food role과 인허가 데이터

`인허가` 키워드는 food role 매칭 조건에 넣지 않는다.

- `인허가`는 sourceDataset 성격에 가까운 키워드다. role 조건으로 쓰면 음식점이 아닌 장소까지 food로 오분류된다.
- food 판단은 `placeFamily === "food"`, Kakao 음식점 카테고리, `식당`, `맛집`, `restaurant` 키워드로 한다.
- `인허가`는 데이터 출처 신뢰도 판단에는 사용할 수 있다.

---

## 저장 정책

추천 결과는 요청 단위와 장소 단위로 DB에 저장한다.

저장 항목:

- 원본 요청 텍스트 (variant별 suffix 포함)
- 파싱된 region, budget, preferredCategory
- 코스 title, duration, congestion, description, estimatedBudget snapshot
- 추천 장소 목록 (순서, 점수, 이동 시간, 비용)

상세 조회 시 추천 당시 snapshot을 우선 사용한다. 추천 직후 응답과 상세 조회 응답이 달라지지 않도록 하기 위함이다.

날씨 데이터도 requestId 단위로 메모리에 snapshot한다 (`weatherSnapshotByRequestId`).

---

## 운영 원칙

### AI는 장소를 만들지 않는다

AI는 자연어 파싱과 설명 생성에만 관여한다. 장소 선택은 반드시 DB 후보 안에서만 한다.

### sourceDataset과 장소 카테고리를 분리한다

`LOCALDATA_072404`, `SearchParkInfoService` 같은 sourceDataset 이름은 후보 조회 범위와 신뢰도 판단에 쓴다. role 매칭 조건에 직접 넣으면 오분류 위험이 커진다.

### placeFamily가 있으면 키워드보다 우선한다

Kakao 정규화 데이터가 쌓일수록 텍스트 키워드보다 `placeFamily`를 먼저 보는 것이 안정적이다.

---

## 추천 로직 수정 체크리스트

- 명시 요청 role이 max 때문에 잘리지 않는가?
- 18시 이후 기본 순서에서 food가 앞으로 오는가?
- 저녁이라는 이유만으로 nightlife가 들어가지 않는가?
- 같은 role이 3개 이상 들어가지 않는가?
- `인허가`가 food role 매칭 조건으로 쓰이지 않는가?
- `placeFamily`가 키워드보다 우선 적용되는가?
- `kakaoCategoryName`, `placeType`, `placeSubtype`이 role 텍스트 추론에 포함되는가?
- `mapUrl` 응답에 `kakaoPlaceUrl`이 우선 반영되는가?
- LLM 설명이 실제 variant 코스(`variant.course`)를 기준으로 생성되는가?
- LLM 호출 실패 시 해당 variant만 fallback 되고 다른 variant에 영향이 없는가?
- 후보 장소가 부족해도 최소한의 코스가 만들어지는가?
- 추천 당시 snapshot이 저장되는가?

---

## 향후 개선 방향

### 1. food 하위 타입 반영

사용자가 "파스타", "고기", "브런치"처럼 구체적으로 요청하면 food 하위 placeType까지 정렬에 반영한다.

### 2. 목적별 기본 role 미세 조정

지금은 기본 순서를 하나로 유지한다. 필요한 경우에만 최소한으로 추가한다.

- 첫 데이트: `cafe`, `culture`, `walk` 선호
- 가족: `attraction`, `walk`, `food` 선호
- 친구: `food`, `activity`, `cafe` 선호

### 3. 설명에 요청 반영 근거 노출

```text
"카페와 공원을 넣어달라는 요청을 우선 반영했고, 저녁 시간대라 식사를 앞쪽에 배치했습니다."
```

### 4. 추천 품질 로그

추천 결과마다 내부 품질 로그를 남기면 개선이 쉬워진다.

로그 후보: `parsedRequest`, `requestedRoles`, `finalRoles`, 장소별 role match 여부, fallback 여부, 예상 total duration·budget

### 5. 자연어 카테고리 확장

Kakao 파싱이 좋아지면 더 구체적인 키워드도 받을 수 있다.

확장 후보: 브런치, 베이커리, 오마카세, 파스타, 고기, 분식, 팝업, 편집샵, 서점, 소품샵
