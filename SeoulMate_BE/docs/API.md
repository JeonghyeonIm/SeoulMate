# SeoulMate_BE API

## Overview

이 문서는 현재 정의된 `SeoulMate_BE` 백엔드 API 초안을 정리한 문서다.
현 시점 기준으로 엔드포인트 목록은 정의되어 있지만, 요청/응답 스키마와 실제 구현 코드는 아직 확정되지 않았다.

## Base URL

```text
<!-- TODO: fill in -->
```

## Authentication

- 인증 방식:
  - JWT Bearer Token
- 인증 헤더 형식:

```http
Authorization: Bearer <JWT>
```

- 인증이 필요한 API는 각 엔드포인트의 `기타` 항목에 명시했다.

## Endpoint Summary

| 카테고리 | 기능 | 사용자 | Method | URL |
|---|---|---|---|---|
| 인증 | 로그인 | 유저 | `POST` | `/auth/login` |
| 인증 | 토큰 갱신 | 유저 | `POST` | `/auth/refresh` |
| 인증 | 회원가입 | 유저 | `POST` | `/auth/signup` |
| 인증 | 로그아웃 | 유저 | `POST` | `/auth/logout` |
| 유저 | 내 정보 조회 | 유저 | `GET` | `/users/me` |
| 유저 | 선호 설정 수정 | 유저 | `PATCH` | `/users/me/preferences` |
| 유저 | 모든 유저 목록 | 관리자 | `GET` | `/users` |
| 유저 | 유저 조회 | 관리자 | `GET` | `/users/{user_id}` |
| 코스 | 코스 추천 요청 | 유저 | `POST` | `/courses/recommend` |
| 코스 | 코스 상세 조회 | 유저 | `GET` | `/courses/{course_id}` |
| 코스 | 코스 저장 | 유저 | `POST` | `/courses/{course_id}/save` |
| 코스 | 코스 저장 취소 | 유저 | `DELETE` | `/courses/{course_id}/save` |
| 코스 | 저장 코스 목록 | 유저 | `GET` | `/courses/saved` |
| 장소 | 장소 상세 조회 | 유저 | `GET` | `/places/{place_id}` |
| 검색 | 장소 검색 | 유저 | `GET` | `/places/search` |

## Auth APIs

### `POST /auth/login`

- 기능: 이메일/소셜 로그인
- 사용자: 유저
- 인증: 불필요
- Query Params: 없음
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

- 기타:
  - 이메일 로그인과 소셜 로그인 방식을 함께 지원하는지 세부 정책 확정 필요

### `POST /auth/refresh`

- 기능: Access Token 재발급
- 사용자: 유저
- 인증: 불필요 또는 Refresh Token 기반
- Query Params: 없음
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

### `POST /auth/signup`

- 기능: 신규 유저 등록
- 사용자: 유저
- 인증: 불필요
- Query Params: 없음
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

### `POST /auth/logout`

- 기능: 토큰 무효화
- 사용자: 유저
- 인증: `<!-- TODO: fill in -->`
- Query Params: 없음
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

## User APIs

### `GET /users/me`

- 기능: 로그인 유저 정보 조회
- 사용자: 유저
- 인증: 필요
- Query Params: 없음
- Path Params: 없음
- Response:

```json
<!-- TODO: fill in -->
```

- 기타:
  - `Authorization` 헤더 필요 (`Bearer JWT`)

### `PATCH /users/me/preferences`

- 기능: 분위기, 지역, 예산 선호 수정
- 사용자: 유저
- 인증: 필요
- Query Params: 없음
- Path Params: 없음
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

- 기타:
  - `Authorization` 헤더 필요 (`Bearer JWT`)

### `GET /users`

- 기능: 전체 유저 목록 조회
- 사용자: 관리자
- 인증: `<!-- TODO: fill in -->`
- Query Params:
  - `page`
  - `page_size`
- Response:

```json
<!-- TODO: fill in -->
```

### `GET /users/{user_id}`

- 기능: ID로 유저 상세 조회
- 사용자: 관리자
- 인증: `<!-- TODO: fill in -->`
- Path Params:
  - `user_id`
- Response:

```json
<!-- TODO: fill in -->
```

## Course APIs

### `POST /courses/recommend`

- 기능: AI 코스 추천 생성
- 사용자: 유저
- 인증: 필요
- Query Params: 없음
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

- 기타:
  - `Authorization` 헤더 필요 (`Bearer JWT`)
  - 추천 로직은 혼잡, 이동, 안전, 비용 가중치를 반영해야 함

### `GET /courses/{course_id}`

- 기능: 코스 상세 정보 조회
- 사용자: 유저
- 인증: 필요
- Path Params:
  - `course_id`
- Response:

```json
<!-- TODO: fill in -->
```

- 기타:
  - `Authorization` 헤더 필요 (`Bearer JWT`)

### `POST /courses/{course_id}/save`

- 기능: 코스 히스토리 저장
- 사용자: 유저
- 인증: 필요
- Path Params:
  - `course_id`
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

- 기타:
  - `Authorization` 헤더 필요 (`Bearer JWT`)

### `DELETE /courses/{course_id}/save`

- 기능: 저장된 코스 삭제
- 사용자: 유저
- 인증: 필요
- Path Params:
  - `course_id`
- Response:

```json
<!-- TODO: fill in -->
```

- 기타:
  - `Authorization` 헤더 필요 (`Bearer JWT`)

### `GET /courses/saved`

- 기능: 저장한 코스 목록 조회
- 사용자: 유저
- 인증: 필요
- Query Params:
  - `page`
  - `page_size`
- Response:

```json
<!-- TODO: fill in -->
```

- 기타:
  - `Authorization` 헤더 필요 (`Bearer JWT`)

## Place APIs

### `GET /places/{place_id}`

- 기능: 장소 상세 정보 조회
- 사용자: 유저
- 인증: 필요
- Path Params:
  - `place_id`
- Response:

```json
<!-- TODO: fill in -->
```

- 기타:
  - `Authorization` 헤더 필요 (`Bearer JWT`)

### `GET /places/search`

- 기능: 장소명, 지역 기반 장소 검색
- 사용자: 유저
- 인증: 필요
- Query Params:
  - `q`
  - `region`
  - `category` (optional)
  - `page` (optional)
  - `page_size` (optional)
- Response:

```json
<!-- TODO: fill in -->
```

- 기타:
  - `Authorization` 헤더 필요 (`Bearer JWT`)

## Notes

- 현재 저장소에는 실제 라우트 구현이 없으므로, 이 문서는 기획/설계 기준의 API 초안이다.
- 인증/인가 정책 중 관리자 권한 판별 방식은 아직 저장소에서 확인되지 않았다.
- 요청/응답 DTO, 에러 코드, 페이징 응답 형식은 추후 확정 필요하다.
