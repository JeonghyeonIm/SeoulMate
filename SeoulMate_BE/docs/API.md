# SeoulMate_BE API

## Overview

이 문서는 현재 `SeoulMate_BE`에 구현되어 있는 API를 설명합니다.

## Base URL

기본 API Base URL:

```text
http://localhost:<PORT>/api
```

서버는 동일한 라우터를 루트 경로에도 마운트하고 있으므로 대부분의 `/api/...` 엔드포인트는 `/...` 경로로도 접근할 수 있습니다. 이 문서에서는 `/api` 경로를 기준 경로로 사용합니다.

## Authentication

- 보호된 엔드포인트는 아래 형식의 액세스 토큰 헤더가 필요합니다:

```http
Authorization: Bearer <access_token>
```

- 로그인, 회원가입, 토큰 재발급 응답은 공통으로 아래 인증 응답 형식을 사용합니다:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "nickname": "seoulmate"
  },
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

## Error Response

대부분의 처리된 오류 응답은 아래 형식을 사용합니다:

```json
{
  "status": 400,
  "message": "한글 오류 사유"
}
```

## Endpoint Summary

| Category  | Method   | URL                            | Auth | Status      |
| --------- | -------- | ------------------------------ | ---- | ----------- |
| Bootstrap | `GET`    | `/health`                      | No   | Implemented |
| Bootstrap | `GET`    | `/api`                         | No   | Implemented |
| Auth      | `POST`   | `/api/auth/signup`             | No   | Implemented |
| Auth      | `POST`   | `/api/auth/login`              | No   | Implemented |
| Auth      | `POST`   | `/api/auth/refresh`            | No   | Implemented |
| Auth      | `POST`   | `/api/auth/logout`             | No   | Implemented |
| Auth      | `GET`    | `/api/auth/kakao`              | No   | Implemented |
| Auth      | `GET`    | `/api/auth/kakao/callback`     | No   | Implemented |
| Auth      | `GET`    | `/api/auth/google`             | No   | Implemented |
| Auth      | `GET`    | `/api/auth/google/callback`    | No   | Implemented |
| Users     | `GET`    | `/api/users/me`                | Yes  | Implemented |
| Users     | `PATCH`  | `/api/users/me/preferences`    | Yes  | Implemented |
| Users     | `GET`    | `/api/users`                   | Yes  | Implemented |
| Users     | `GET`    | `/api/users/{userId}`          | Yes  | Implemented |
| Courses   | `POST`   | `/api/courses/recommend`       | Yes  | Implemented |
| Courses   | `GET`    | `/api/courses`                 | Yes  | Implemented |
| Courses   | `GET`    | `/api/courses/saved`           | Yes  | Implemented |
| Courses   | `GET`    | `/api/courses/{courseId}`      | Yes  | Implemented |
| Courses   | `POST`   | `/api/courses/{courseId}/save` | Yes  | Implemented |
| Courses   | `DELETE` | `/api/courses/{courseId}/save` | Yes  | Implemented |
| Places    | `GET`    | `/api/places/search`           | Yes  | Implemented |
| Places    | `GET`    | `/api/places/{placeId}`        | Yes  | Implemented |

## Bootstrap APIs

### `GET /health`

- 인증: 필요 없음
- 응답:

```json
{
  "message": "SeoulMate_BE is running"
}
```

### `GET /api`

- 인증: 필요 없음
- 응답:

```json
{
  "message": "SeoulMate API root"
}
```

## Auth APIs

### `POST /api/auth/signup`

- 목적: 로컬 계정을 생성합니다
- 인증: 필요 없음
- 요청 본문:

```json
{
  "email": "local1@example.com",
  "password": "password123",
  "nickname": "seoulmate",
  "preferences": {
    "vibes": ["<allowed-vibe>"]
  }
}
```

- 참고:
  - `email`: 필수, 올바른 이메일 형식이어야 합니다
  - `password`: 필수, 최소 8자 이상이어야 합니다
  - `nickname`: 필수, 2자 이상 10자 이하입니다
  - `preferences`는 선택값입니다
  - `preferences.vibes`는 `null` 또는 `src/types/auth.types.ts`에 정의된 허용 vibe 문자열 배열이어야 합니다
  - 현재 구현에서는 이 엔드포인트로 `local` 계정만 생성합니다
- 성공 응답: `201 Created`
- 응답: 공통 인증 응답 형식과 동일
- 주요 오류:
  - `400` 잘못된 요청 본문
  - `409` 이메일 또는 닉네임 중복

### `POST /api/auth/login`

- 목적: 로컬 이메일/비밀번호 로그인
- 인증: 필요 없음
- 요청 본문:

```json
{
  "email": "local1@example.com",
  "password": "password123"
}
```

- 성공 응답: `200 OK`
- 응답: 공통 인증 응답 형식과 동일
- 주요 오류:
  - `400` `email` 또는 `password` 누락
  - `401` 잘못된 로그인 정보

### `POST /api/auth/refresh`

- 목적: 유효한 리프레시 토큰으로 새 액세스 토큰과 리프레시 토큰을 발급합니다
- 인증: 필요 없음
- 요청 본문:

```json
{
  "refreshToken": "<refresh_token>"
}
```

- 성공 응답: `200 OK`
- 응답: 공통 인증 응답 형식과 동일
- 주요 오류:
  - `400` `refreshToken` 누락
  - `401` 유효하지 않거나 만료된 리프레시 토큰, 또는 로그아웃된 토큰

### `POST /api/auth/logout`

- 목적: 리프레시 토큰을 서버 측 블랙리스트에 등록하여 재사용을 차단합니다
- 인증: 필요 없음
- 요청 본문:

```json
{
  "refreshToken": "<refresh_token>"
}
```

- 성공 응답: `204 No Content`
- 참고:
  - 전달된 리프레시 토큰의 SHA-256 해시를 `refresh_token_blacklist` 테이블에 저장합니다
  - 이후 동일 토큰으로 `/api/auth/refresh` 호출 시 `401`을 반환합니다
- 주요 오류:
  - `400` `refreshToken` 누락
  - `401` 유효하지 않거나 만료된 리프레시 토큰

### `GET /api/auth/kakao`

- 목적: Kakao OAuth 로그인을 시작합니다
- 인증: 필요 없음
- 성공 응답: `302 Found`
- 응답: Kakao 인증 URL로 리다이렉트

### `GET /api/auth/kakao/callback`

- 목적: Kakao OAuth 콜백을 처리합니다
- 인증: 필요 없음
- 쿼리 파라미터:
  - `code`: 필수
- 성공 응답: `302 Found`
- 응답: 아래 경로로 리다이렉트

```text
{FRONTEND_URL}/auth/callback?accessToken=...&refreshToken=...
```

### `GET /api/auth/google`

- 목적: Google OAuth 로그인을 시작합니다
- 인증: 필요 없음
- 성공 응답: `302 Found`
- 응답: Google 인증 URL로 리다이렉트

### `GET /api/auth/google/callback`

- 목적: Google OAuth 콜백을 처리합니다
- 인증: 필요 없음
- 쿼리 파라미터:
  - `code`: 필수
- 성공 응답: `302 Found`
- 응답: 아래 경로로 리다이렉트

```text
{FRONTEND_URL}/auth/callback?accessToken=...&refreshToken=...
```

## User APIs

### `GET /api/users/me`

- 목적: 현재 인증된 사용자의 프로필을 조회합니다
- 인증: 필요
- 성공 응답: `200 OK`
- 응답:

```json
{
  "id": "1",
  "email": "user@example.com",
  "nickname": "seoulmate",
  "vibes": ["calm", "romantic"],
  "budget": 30000,
  "role": "user",
  "createdAt": "2026-05-08T10:00:00.000Z",
  "savedCoursesCount": 2
}
```

### `PATCH /api/users/me/preferences`

- 목적: 현재 사용자의 선호 정보를 수정합니다
- 인증: 필요
- 요청 본문:

```json
{
  "vibes": ["calm", "romantic"],
  "regions": ["Seongsu", "Jamsil"],
  "budget": 30000
}
```

- 참고:
  - `vibes`, `regions`, `budget` 중 하나 이상은 반드시 포함되어야 합니다
  - `vibes`, `regions`가 존재하면 문자열 배열이어야 합니다
  - `budget`이 존재하면 양수여야 합니다
  - `regions`가 전달되면 서버는 이를 `,`로 합쳐 하나의 preferred region 문자열로 저장합니다
  - `preferredRegion` (문자열)을 직접 전달하면 `regions` 없이도 지역을 덮어쓸 수 있습니다
- 성공 응답: `200 OK`
- 응답:

```json
{
  "vibes": ["calm", "romantic"],
  "budget": 30000,
  "updatedAt": "2026-05-08T10:05:00.000Z"
}
```

### `GET /api/users`

- 목적: 사용자 목록을 조회합니다
- 인증: 필요
- 쿼리 파라미터:
  - `page` 선택, 기본값 `1`
  - `page_size` 또는 `pageSize` 선택, 기본값 `20`, 최대 `100`
- 성공 응답: `200 OK`
- 응답:

```json
{
  "data": [
    {
      "id": "1",
      "email": "user@example.com",
      "nickname": "seoulmate",
      "vibes": ["calm"],
      "budget": 30000,
      "role": "user",
      "createdAt": "2026-05-08T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

- 참고:
  - 현재 구현에서는 이 엔드포인트에 대해 관리자 전용 권한을 강제하지 않습니다

### `GET /api/users/{userId}`

- 목적: 숫자 ID로 특정 사용자를 조회합니다
- 인증: 필요
- 경로 파라미터:
  - `userId`: 양의 정수
- 성공 응답: `200 OK`
- 응답:

```json
{
  "id": "1",
  "email": "user@example.com",
  "nickname": "seoulmate",
  "vibes": ["calm"],
  "budget": 30000,
  "role": "user",
  "createdAt": "2026-05-08T10:00:00.000Z"
}
```

## Course APIs

### `POST /api/courses/recommend`

- 목적: 코스 추천을 생성하고 인증된 사용자의 추천 이력으로 저장합니다
- 인증: 필요
- 요청 본문:

```json
{
  "query": "오늘 저녁 성수에서 조용한 데이트 코스 추천해줘",
  "region": "성수",
  "vibes": ["조용한", "낭만적인"],
  "budget": 40000,
  "duration": "gt-2h-lte-4h",
  "dateTime": "2026-05-08T18:00:00+09:00",
  "purpose": "데이트"
}
```

- 참고:
  - 레거시 입력 형식으로 `{ "input": "free text request" }` 도 지원합니다
  - 구조화 요청 방식에서는 `region`, `vibes`, `budget`, `duration`이 필요합니다
  - `budget`은 `0`부터 `200000`까지 `5000`원 단위로 전달합니다
  - `budget`이 `200000+`인 경우에는 `200001`을 전달합니다
  - `duration`은 아래 enum 중 하나여야 합니다
    - `lte-2h`: 2시간 이하
    - `gt-2h-lte-4h`: 2시간 초과~4시간 이하
    - `gt-4h-lte-6h`: 4시간 초과~6시간 이하
    - `gt-6h-lte-8h`: 6시간 초과~8시간 이하
    - `gt-8h-lte-10h`: 8시간 초과~10시간 이하
    - `gt-10h-lte-12h`: 10시간 초과~12시간 이하
    - `gt-12h`: 12시간 초과
  - `dateTime`은 요청 본문에 명시된 값을 query 안의 시간 표현보다 우선 사용합니다
  - `dateTime`은 현재 시각 이후 10일 이내만 허용합니다
- 성공 응답: `200 OK`
- 응답:

```json
{
  "recommendedCourseId": "crs_12",
  "courses": [
    {
      "id": "crs_12",
      "title": "성수 조용한 데이트 코스",
      "description": "이동 부담이 낮은 차분한 코스입니다.",
      "recommendationRank": 1,
      "recommendationType": "best",
      "isRecommended": true,
      "totalCost": 36000,
      "duration": 240,
      "congestion": "medium",
      "weather": {
        "skyStatus": "맑음",
        "temperature": 18,
        "rainProbability": 20,
        "weatherAlert": null,
        "source": "short-term"
      },
      "places": [
        {
          "id": "plc_101",
          "name": "샘플 카페",
          "lat": 37.54,
          "lng": 127.05,
          "mapUrl": "https://place.map.kakao.com/...",
          "order": 1,
          "stayDuration": 60,
          "priceMin": 9000,
          "priceMax": 9000,
          "reason": "분위기와 잘 맞는 조용한 카페"
        }
      ]
    },
    {
      "id": "crs_13",
      "title": "성수 실내 데이트 코스",
      "description": "날씨나 혼잡도 리스크를 낮춘 실내 중심 코스입니다.",
      "recommendationRank": 2,
      "recommendationType": "indoor",
      "isRecommended": false,
      "totalCost": 32000,
      "duration": 210,
      "congestion": "medium",
      "weather": {
        "source": "short-term",
        "skyStatus": "맑음",
        "temperature": 18,
        "rainProbability": 20,
        "weatherAlert": null
      },
      "places": []
    }
  ]
}
```

- 응답 필드:
  - `courses`: 추천 코스 배열. 기본 3개를 반환하고, 후보가 충분하면 최대 4개까지 반환합니다
  - `recommendedCourseId`: 서버가 가장 추천하는 코스 ID. 같은 코스는 `courses[].isRecommended: true`로도 표시됩니다
  - `courses[].recommendationRank`: 추천 순위. 1번이 가장 추천하는 코스입니다
  - `courses[].recommendationType`: 추천 성격. 분위기 선택 시 `mood-quiet`, `mood-hip`, `mood-poetic`, `mood-romantic`, `mood-lively`, `mood-calm`, `mood-modern`, `mood-emotional`, `mood-nature` 중 하나가 반환됩니다. 분위기 선택이 없으면 `best`, `balanced`, `indoor`, `low-budget`, `short-walk` 조합을 반환합니다
  - `courses[].congestion`: 행정동 단위 서울 생활인구 통계 기반 혼잡도. 산출 불가 시 `unknown`
  - `courses[].weather`: 모든 날씨 source에서 `{ source, skyStatus, temperature, rainProbability, weatherAlert }` 형식으로 반환합니다
  - `courses[].places[]`: 코스에 포함된 장소 배열
    - `id`: 장소 ID (`plc_숫자` 형식)
    - `name`: 장소명
    - `lat`, `lng`: 위경도
    - `mapUrl`: Kakao 지도 장소 URL. 매칭 정보가 없으면 `null`
    - `order`: 코스 내 방문 순서
    - `stayDuration`: 예상 체류 시간 (분). 정보 없으면 `null`
    - `priceMin`, `priceMax`: 예상 비용 범위 (원). 정보 없으면 `0`
    - `reason`: LLM이 이 장소를 선택한 이유. 정보 없으면 `null`
  - `warnings` (optional): 외부 API 장애 등으로 일부 정보가 누락된 경우에만 포함되는 경고 메시지 배열

예시: 날씨 API timeout 발생 시

```json
{
  "courses": [
    {
      "id": "crs_12",
      "title": "성수 조용한 데이트 코스",
      "description": "날씨 정보 없이 구성한 추천 코스입니다.",
      "totalCost": 36000,
      "duration": 240,
      "congestion": "medium",
      "places": []
    }
  ],
  "warnings": ["날씨 정보를 가져오는 데 실패하여 날씨 없이 추천을 진행했습니다."]
}
```

### `GET /api/courses`

- 목적: 현재 사용자가 생성한 추천 코스 목록을 조회합니다
- 인증: 필요
- 쿼리 파라미터:
  - `page` 선택, 기본값 `1`
  - `page_size` 또는 `pageSize` 선택, 기본값 `10`, 최대 `50`
  - `from` 선택, ISO 8601 날짜·시간 문자열. 이 시각 이후 생성된 코스만 반환합니다 (예: `2026-05-01T00:00:00+09:00`)
  - `to` 선택, ISO 8601 날짜·시간 문자열. 이 시각 이전 생성된 코스만 반환합니다
- 성공 응답: `200 OK`
- 응답:

```json
{
  "data": [
    {
      "id": "crs_12",
      "title": "Seongsu Date Course",
      "description": "A calm route with low travel burden.",
      "totalCost": 36000,
      "duration": 240,
      "congestion": "medium",
      "weather": {
        "source": "short-term",
        "skyStatus": "맑음",
        "temperature": 18,
        "rainProbability": 20,
        "weatherAlert": null
      },
      "places": [
        {
          "id": "plc_101",
          "name": "Sample Cafe",
          "lat": 37.54,
          "lng": 127.05,
          "mapUrl": "https://place.map.kakao.com/...",
          "order": 1,
          "stayDuration": 60,
          "priceMin": 9000,
          "priceMax": 9000,
          "reason": "Good fit for the requested mood"
        }
      ]
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10
}
```

- 참고:
  - `weather.source`: `citydata`, `ultra-short-term`, `short-term`, `medium-term`, `unavailable` 중 하나. 날씨 정보가 없으면 `unavailable`이고 나머지 필드는 `null`
  - `places[].mapUrl`: Kakao 지도 장소 URL. 매칭 정보가 없으면 `null`

### `GET /api/courses/saved`

- 목적: 현재 사용자가 저장한 코스 목록을 조회합니다
- 인증: 필요
- 쿼리 파라미터:
  - `page` 선택, 기본값 `1`
  - `page_size` 또는 `pageSize` 선택, 기본값 `10`, 최대 `50`
- 성공 응답: `200 OK`
- 응답 형식: `GET /api/courses`와 동일

### `GET /api/courses/{courseId}`

- 목적: 현재 사용자의 특정 코스를 조회합니다
- 인증: 필요
- 경로 파라미터:
  - `courseId`: 양의 정수, `crs_12` 형식도 허용
- 성공 응답: `200 OK`
- 응답 형식: `GET /api/courses`의 `data[]` 각 항목과 동일

### `POST /api/courses/{courseId}/save`

- 목적: 생성된 코스를 저장합니다
- 인증: 필요
- 경로 파라미터:
  - `courseId`: 양의 정수, `crs_12` 형식도 허용
- 요청 본문:

```json
{
  "notes": "Try this next weekend"
}
```

- 성공 응답: `201 Created`
- 응답:

```json
{
  "savedAt": "2026-05-08T10:10:00.000Z"
}
```

- 주요 오류:
  - `404` 코스를 찾을 수 없음
  - `409` 이미 저장된 코스

### `DELETE /api/courses/{courseId}/save`

- 목적: 저장한 코스를 삭제합니다
- 인증: 필요
- 경로 파라미터:
  - `courseId`: 양의 정수, `crs_12` 형식도 허용
- 성공 응답: `204 No Content`
- 주요 오류:
  - `404` 저장된 코스를 찾을 수 없음

## Place APIs

### `GET /api/places/search`

- 목적: 장소를 검색합니다
- 인증: 필요
- 쿼리 파라미터:
  - `q` 선택
  - `region` 선택
  - `category` 선택
  - `page` 선택, 기본값 `1`
  - `page_size` 또는 `pageSize` 선택, 기본값 `10`
- 성공 응답: `200 OK`
- 응답:

```json
{
  "data": [
    {
      "id": "plc_101",
      "name": "Seoul Forest",
      "category": "park",
      "address": "Seongdong-gu, Seoul"
    }
  ],
  "total": 1
}
```

### `GET /api/places/{placeId}`

- 목적: 장소 상세 정보를 조회합니다
- 인증: 필요
- 경로 파라미터:
  - `placeId`: 양의 정수, `plc_101` 형식도 허용
- 성공 응답: `200 OK`
- 응답:

```json
{
  "id": "plc_101",
  "name": "Seoul Forest",
  "category": "park",
  "address": "Seongdong-gu, Seoul",
  "lat": 37.54,
  "lng": 127.04,
  "congestion": "unknown",
  "priceMin": 0,
  "priceMax": 0,
  "stayDuration": 50,
  "openHours": "Check before visit",
  "imageUrls": []
}
```

## Notes

- `GET /api/users`와 `GET /api/users/{userId}`는 현재 관리자 전용이 아니라 인증만 필요합니다.
- `courseId`, `placeId` 경로 파라미터는 순수 숫자 ID뿐 아니라 `crs_12`, `plc_101` 같은 접두사 형식도 허용합니다.
