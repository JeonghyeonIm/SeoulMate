# SeoulMate_BE API

## 개요

이 문서는 `SeoulMate_BE`의 예정 API 명세를 정리합니다.
현재 구현은 최소 부트스트랩 수준이지만, DB 구조는 Supabase 기준으로 정리되었기 때문에 이후 API도 그 구조를 따라가면 됩니다.

## 현재 구현 상태

- 현재 구현됨:
  - `GET /health`
  - `GET /api`
- 예정:
  - Supabase Auth 기반 인증 API
  - 사용자 프로필 API
  - 장소 검색 API
  - 추천 요청/조회 API
  - 저장 코스 API

## Base URL

```text
<!-- TODO: fill in -->
```

## 인증 모델

- 인증 방식:
  - Supabase Auth
  - JWT Bearer Token
- 표준 헤더 형식:

```http
Authorization: Bearer <JWT>
```

- 참고 사항:
  - 사용자 계정 원본은 `auth.users`
  - 앱 사용자 프로필은 `profiles`
  - 관리자성 작업이나 서버 간 작업은 `SUPABASE_SERVICE_ROLE_KEY` 사용 가능

## 엔드포인트 요약

| 분류      | 기능                | 주체   | 메서드   | URL                         | 상태        |
| --------- | ------------------- | ------ | -------- | --------------------------- | ----------- |
| Bootstrap | 헬스 체크           | Public | `GET`    | `/health`                   | Implemented |
| Bootstrap | API 루트 확인       | Public | `GET`    | `/api`                      | Implemented |
| Auth      | 회원가입            | Public | `POST`   | `/auth/signup`              | Planned     |
| Auth      | 로그인              | Public | `POST`   | `/auth/login`               | Planned     |
| Auth      | 로그아웃            | User   | `POST`   | `/auth/logout`              | Planned     |
| Auth      | 토큰 재발급         | User   | `POST`   | `/auth/refresh`             | Planned     |
| User      | 내 프로필 조회      | User   | `GET`    | `/users/me`                 | Planned     |
| User      | 선호 정보 수정      | User   | `PATCH`  | `/users/me/preferences`     | Planned     |
| Place     | 장소 검색           | User   | `GET`    | `/places/search`            | Planned     |
| Place     | 장소 상세 조회      | User   | `GET`    | `/places/{place_id}`        | Planned     |
| Course    | 추천 요청 생성      | User   | `POST`   | `/courses/recommend`        | Planned     |
| Course    | 추천 코스 상세 조회 | User   | `GET`    | `/courses/{course_id}`      | Planned     |
| Course    | 추천 코스 저장      | User   | `POST`   | `/courses/{course_id}/save` | Planned     |
| Course    | 추천 코스 저장 해제 | User   | `DELETE` | `/courses/{course_id}/save` | Planned     |
| Course    | 저장한 코스 목록    | User   | `GET`    | `/courses/saved`            | Planned     |

## Bootstrap API

### `GET /health`

- 목적: 서버 런타임 상태 확인
- 인증: 필요 없음
- Response:

```json
{
  "message": "SeoulMate_BE is running"
}
```

### `GET /api`

- 목적: API 루트 응답 확인
- 인증: 필요 없음
- Response:

```json
{
  "message": "SeoulMate API root"
}
```

## Auth API

### `POST /auth/signup`

- 목적: Supabase Auth 회원가입
- 인증: 필요 없음
- Request Body 예시:

```json
{
  "email": "user@example.com",
  "password": "plain-password",
  "nickname": "seoulmate_user"
}
```

- 처리 메모:
  - Supabase Auth에 사용자 생성
  - 트리거를 통해 `profiles` 자동 생성

### `POST /auth/login`

- 목적: Supabase Auth 로그인
- 인증: 필요 없음
- Request Body 예시:

```json
{
  "email": "user@example.com",
  "password": "plain-password"
}
```

### `POST /auth/logout`

- 목적: 현재 세션 무효화
- 인증: 필요

### `POST /auth/refresh`

- 목적: 액세스 토큰 재발급
- 인증: refresh token 기반

## User API

### `GET /users/me`

- 목적: 현재 로그인 사용자의 `profiles` 정보 조회
- 인증: 필요
- 응답 대상:
  - `id`
  - `email`
  - `nickname`
  - `preferredRegion`
  - `preferredCategory`
  - `createdAt`
  - `updatedAt`

### `PATCH /users/me/preferences`

- 목적: `profiles.preferred_region`, `profiles.preferred_category` 수정
- 인증: 필요
- Request Body 예시:

```json
{
  "preferredRegion": "마포구",
  "preferredCategory": "카페"
}
```

## Place API

### `GET /places/search`

- 목적: `public_data` 기준 장소 검색
- 인증: 필요
- Query Params:
  - `q`
  - `region`
  - `category`
  - `page`
  - `page_size`

### `GET /places/{place_id}`

- 목적: `public_data` 단건 상세 조회
- 인증: 필요

## Course API

### `POST /courses/recommend`

- 목적: 추천 요청 생성 및 결과 저장
- 인증: 필요
- DB 연결 대상:
  - `recommendation_requests`
  - `recommendations`
- Request Body 예시:

```json
{
  "requestText": "한적하게 산책하고 카페 들를 수 있는 코스 추천해줘",
  "preferredRegion": "성북구",
  "preferredCategory": "산책",
  "budget": 30000,
  "companion": "friend",
  "transportMode": "subway"
}
```

### `GET /courses/{course_id}`

- 목적: 특정 추천 요청과 그 하위 추천 장소 목록 조회
- 인증: 필요
- DB 연결 대상:
  - `recommendation_requests`
  - `recommendations`
  - `public_data`

### `POST /courses/{course_id}/save`

- 목적: 추천 코스를 저장 목록에 추가
- 인증: 필요
- DB 연결 대상:
  - `saved_courses`

### `DELETE /courses/{course_id}/save`

- 목적: 저장 코스 해제
- 인증: 필요
- DB 연결 대상:
  - `saved_courses`

### `GET /courses/saved`

- 목적: 저장한 추천 코스 목록 조회
- 인증: 필요
- DB 연결 대상:
  - `saved_courses`
  - `recommendation_requests`

## 현재 DB 기준 리소스 매핑

| API 리소스   | 주 테이블                 |
| ------------ | ------------------------- |
| User         | `profiles`                |
| Place        | `public_data`             |
| Course       | `recommendation_requests` |
| Course items | `recommendations`         |
| Saved course | `saved_courses`           |

## 미정 항목

- 추천 결과 응답 DTO의 최종 형태
- 점수 세부 항목을 API에 노출할지 여부
- 관리자용 장소 적재/동기화 API를 별도 둘지 여부
- 소셜 로그인 공급자 범위
