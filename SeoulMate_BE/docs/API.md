# SeoulMate_BE API

## 개요

이 문서는 `SeoulMate_BE`의 예정 API 명세를 정리합니다.
현재 구현은 최소 부트스트랩 수준이며, 인증과 데이터 저장은 일반 PostgreSQL 기반 서버 구조를 전제로 합니다.

## 현재 구현 상태

- 현재 구현됨:
  - `GET /health`
  - `GET /api`
- 예정:
  - 자체 인증 API
  - 사용자 정보 API
  - 장소 검색 API
  - 추천 요청/조회 API
  - 저장 코스 API

## Base URL

```text
<!-- TODO: fill in -->
```

## 인증 모델

- 인증 방식:
  - 서버 자체 인증
  - JWT Bearer Token 예정
- 사용자 저장 테이블:
  - `users`

## 엔드포인트 요약

| 분류      | 기능                | 주체   | 메서드   | URL                         | 상태        |
| --------- | ------------------- | ------ | -------- | --------------------------- | ----------- |
| Bootstrap | 헬스 체크           | Public | `GET`    | `/health`                   | Implemented |
| Bootstrap | API 루트 확인       | Public | `GET`    | `/api`                      | Implemented |
| Auth      | 회원가입            | Public | `POST`   | `/auth/signup`              | Planned     |
| Auth      | 로그인              | Public | `POST`   | `/auth/login`               | Planned     |
| Auth      | 로그아웃            | User   | `POST`   | `/auth/logout`              | Planned     |
| User      | 내 정보 조회        | User   | `GET`    | `/users/me`                 | Planned     |
| User      | 선호 정보 수정      | User   | `PATCH`  | `/users/me/preferences`     | Planned     |
| Place     | 장소 검색           | User   | `GET`    | `/places/search`            | Planned     |
| Place     | 장소 상세 조회      | User   | `GET`    | `/places/{place_id}`        | Planned     |
| Course    | 추천 요청 생성      | User   | `POST`   | `/courses/recommend`        | Planned     |
| Course    | 추천 코스 상세 조회 | User   | `GET`    | `/courses/{course_id}`      | Planned     |
| Course    | 추천 코스 저장      | User   | `POST`   | `/courses/{course_id}/save` | Planned     |
| Course    | 추천 코스 저장 해제 | User   | `DELETE` | `/courses/{course_id}/save` | Planned     |
| Course    | 저장한 코스 목록    | User   | `GET`    | `/courses/saved`            | Planned     |

## Auth API

### `POST /auth/signup`

- 목적: 사용자 계정 생성
- 저장 대상: `users`
- Request Body 예시:

```json
{
  "email": "user@example.com",
  "password": "plain-password",
  "nickname": "seoulmate_user"
}
```

### `POST /auth/login`

- 목적: 이메일/비밀번호 로그인
- 인증 저장 방식:
  - 추후 JWT 발급 예정

### `POST /auth/logout`

- 목적: 현재 세션 또는 토큰 무효화

## User API

### `GET /users/me`

- 목적: 현재 로그인 사용자 조회
- 조회 대상: `users`

### `PATCH /users/me/preferences`

- 목적: `preferred_region`, `preferred_category` 수정
- 저장 대상: `users`

## Place API

### `GET /places/search`

- 목적: `public_data` 기준 장소 검색
- Query Params:
  - `q`
  - `region`
  - `category`
  - `page`
  - `page_size`

### `GET /places/{place_id}`

- 목적: `public_data` 단건 상세 조회

## Course API

### `POST /courses/recommend`

- 목적: 추천 요청 생성 및 결과 저장
- DB 연결 대상:
  - `recommendation_requests`
  - `recommendations`

### `GET /courses/{course_id}`

- 목적: 추천 요청과 하위 장소 목록 조회
- DB 연결 대상:
  - `recommendation_requests`
  - `recommendations`
  - `public_data`

### `POST /courses/{course_id}/save`

- 목적: 추천 코스를 저장 목록에 추가
- DB 연결 대상:
  - `saved_courses`

### `DELETE /courses/{course_id}/save`

- 목적: 저장 코스 해제
- DB 연결 대상:
  - `saved_courses`

### `GET /courses/saved`

- 목적: 저장한 추천 코스 목록 조회
- DB 연결 대상:
  - `saved_courses`
  - `recommendation_requests`

## 리소스 매핑

| API 리소스   | 주 테이블                 |
| ------------ | ------------------------- |
| User         | `users`                   |
| Place        | `public_data`             |
| Course       | `recommendation_requests` |
| Course items | `recommendations`         |
| Saved course | `saved_courses`           |
