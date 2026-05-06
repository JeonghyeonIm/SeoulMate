# SeoulMate_BE Database

## 개요

이 문서는 `SeoulMate_BE`의 Supabase 기반 데이터베이스 설계를 설명합니다.
이제 인증은 Supabase Auth의 `auth.users`가 담당하고, 애플리케이션 전용 데이터는 `public` 스키마 아래 테이블로 관리합니다.

현재 프로젝트 기준 핵심 구성은 아래와 같습니다.

- `auth.users`: Supabase Auth 기본 사용자
- `profiles`: 앱 사용자 프로필 및 선호 정보
- `public_data`: 서울 공공데이터 기반 장소 정보
- `recommendation_requests`: 추천 요청 단위
- `recommendations`: 추천 결과 상세 항목
- `saved_courses`: 저장한 추천 코스
- `public_data_sync_runs`: 공공데이터 동기화 이력

## 설계 방향

- 인증/세션은 Supabase Auth 사용
- 앱 프로필은 `profiles`에서 별도 관리
- 장소 데이터는 `public_data`에 적재
- 추천 결과는 요청 단위와 결과 항목 단위로 분리 저장
- 저장 코스 기능은 `saved_courses`로 관리
- 사용자 데이터는 Row Level Security(RLS)로 본인 데이터만 접근 가능하게 제한

## 테이블 요약

### `profiles`

Supabase Auth 사용자와 1:1로 연결되는 앱 사용자 프로필 테이블입니다.

| 컬럼                 | 타입           | 제약조건                    | 설명          |
| -------------------- | -------------- | --------------------------- | ------------- |
| `id`                 | `UUID`         | `PK`, `FK -> auth.users.id` | 사용자 ID     |
| `email`              | `TEXT`         | `NOT NULL`, `UNIQUE`        | 로그인 이메일 |
| `nickname`           | `VARCHAR(50)`  | `NOT NULL`, `UNIQUE`        | 닉네임        |
| `preferred_region`   | `VARCHAR(50)`  | `NULL`                      | 선호 지역     |
| `preferred_category` | `VARCHAR(100)` | `NULL`                      | 선호 카테고리 |
| `created_at`         | `TIMESTAMPTZ`  | `NOT NULL`, `DEFAULT now()` | 생성 시각     |
| `updated_at`         | `TIMESTAMPTZ`  | `NOT NULL`, `DEFAULT now()` | 수정 시각     |

### `public_data`

서울 공공데이터 또는 외부 API에서 수집한 장소/콘텐츠 원본 데이터를 저장합니다.

| 컬럼               | 타입            | 제약조건                    | 설명                  |
| ------------------ | --------------- | --------------------------- | --------------------- |
| `id`               | `BIGSERIAL`     | `PK`                        | 장소 고유 ID          |
| `source_dataset`   | `VARCHAR(100)`  | `NULL`                      | 데이터셋 분류명       |
| `source_record_id` | `VARCHAR(150)`  | `NULL`                      | 원천 시스템 레코드 ID |
| `title`            | `VARCHAR(255)`  | `NOT NULL`                  | 장소/콘텐츠명         |
| `category`         | `VARCHAR(100)`  | `NOT NULL`                  | 카테고리              |
| `region`           | `VARCHAR(50)`   | `NULL`                      | 지역                  |
| `address`          | `TEXT`          | `NULL`                      | 주소                  |
| `latitude`         | `NUMERIC(10,7)` | `NULL`                      | 위도                  |
| `longitude`        | `NUMERIC(10,7)` | `NULL`                      | 경도                  |
| `source`           | `VARCHAR(100)`  | `NULL`                      | 데이터 출처           |
| `source_url`       | `TEXT`          | `NULL`                      | 원본 URL              |
| `metadata`         | `JSONB`         | `NOT NULL`, `DEFAULT '{}'`  | 부가 메타데이터       |
| `created_at`       | `TIMESTAMPTZ`   | `NOT NULL`, `DEFAULT now()` | 생성 시각             |
| `updated_at`       | `TIMESTAMPTZ`   | `NOT NULL`, `DEFAULT now()` | 수정 시각             |

### `recommendation_requests`

사용자가 추천을 요청한 1회 단위를 저장합니다.
현재 API 관점에서는 `course_id`처럼 다룰 수 있는 상위 엔터티입니다.

| 컬럼                 | 타입           | 제약조건                        | 설명                       |
| -------------------- | -------------- | ------------------------------- | -------------------------- |
| `id`                 | `UUID`         | `PK`                            | 추천 요청 ID               |
| `user_id`            | `UUID`         | `NOT NULL`, `FK -> profiles.id` | 요청 사용자                |
| `request_text`       | `TEXT`         | `NULL`                          | 자유 입력 요청 문장        |
| `preferred_region`   | `VARCHAR(50)`  | `NULL`                          | 요청 시점 지역 선호        |
| `preferred_category` | `VARCHAR(100)` | `NULL`                          | 요청 시점 카테고리 선호    |
| `budget`             | `INTEGER`      | `NULL`                          | 예산                       |
| `companion`          | `VARCHAR(50)`  | `NULL`                          | 동행 유형                  |
| `transport_mode`     | `VARCHAR(30)`  | `NULL`                          | 이동 수단                  |
| `status`             | `VARCHAR(20)`  | `NOT NULL`                      | `pending/completed/failed` |
| `created_at`         | `TIMESTAMPTZ`  | `NOT NULL`, `DEFAULT now()`     | 생성 시각                  |
| `updated_at`         | `TIMESTAMPTZ`  | `NOT NULL`, `DEFAULT now()`     | 수정 시각                  |

### `recommendations`

개별 추천 장소 결과를 저장합니다.
하나의 `recommendation_requests` 아래 여러 건이 연결됩니다.

| 컬럼             | 타입           | 제약조건                                       | 설명           |
| ---------------- | -------------- | ---------------------------------------------- | -------------- |
| `id`             | `BIGSERIAL`    | `PK`                                           | 추천 결과 ID   |
| `request_id`     | `UUID`         | `NOT NULL`, `FK -> recommendation_requests.id` | 상위 추천 요청 |
| `user_id`        | `UUID`         | `NOT NULL`, `FK -> profiles.id`                | 사용자 ID      |
| `public_data_id` | `BIGINT`       | `NOT NULL`, `FK -> public_data.id`             | 추천 장소 ID   |
| `course_order`   | `INTEGER`      | `NULL`                                         | 코스 내 순서   |
| `score`          | `NUMERIC(5,2)` | `NOT NULL`                                     | 추천 점수      |
| `reason`         | `TEXT`         | `NULL`                                         | 추천 사유      |
| `travel_minutes` | `INTEGER`      | `NULL`                                         | 예상 이동 시간 |
| `estimated_cost` | `INTEGER`      | `NULL`                                         | 예상 비용      |
| `created_at`     | `TIMESTAMPTZ`  | `NOT NULL`, `DEFAULT now()`                    | 생성 시각      |

### `saved_courses`

사용자가 저장한 추천 요청 단위를 관리합니다.

| 컬럼         | 타입          | 제약조건                                       | 설명             |
| ------------ | ------------- | ---------------------------------------------- | ---------------- |
| `id`         | `BIGSERIAL`   | `PK`                                           | 저장 ID          |
| `user_id`    | `UUID`        | `NOT NULL`, `FK -> profiles.id`                | 저장 사용자      |
| `request_id` | `UUID`        | `NOT NULL`, `FK -> recommendation_requests.id` | 저장한 추천 요청 |
| `notes`      | `TEXT`        | `NULL`                                         | 사용자 메모      |
| `saved_at`   | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()`                    | 저장 시각        |

### `public_data_sync_runs`

공공데이터 적재/동기화 작업 이력을 저장합니다.

| 컬럼             | 타입           | 제약조건                    | 설명                       |
| ---------------- | -------------- | --------------------------- | -------------------------- |
| `id`             | `BIGSERIAL`    | `PK`                        | 실행 ID                    |
| `source`         | `VARCHAR(100)` | `NOT NULL`                  | 동기화 대상 출처           |
| `status`         | `VARCHAR(20)`  | `NOT NULL`                  | `started/completed/failed` |
| `imported_count` | `INTEGER`      | `NOT NULL`, `DEFAULT 0`     | 신규 적재 수               |
| `updated_count`  | `INTEGER`      | `NOT NULL`, `DEFAULT 0`     | 갱신 수                    |
| `error_message`  | `TEXT`         | `NULL`                      | 실패 메시지                |
| `started_at`     | `TIMESTAMPTZ`  | `NOT NULL`, `DEFAULT now()` | 시작 시각                  |
| `finished_at`    | `TIMESTAMPTZ`  | `NULL`                      | 종료 시각                  |

## 테이블 관계

- `auth.users (1) : (1) profiles`
- `profiles (1) : (N) recommendation_requests`
- `profiles (1) : (N) recommendations`
- `profiles (1) : (N) saved_courses`
- `public_data (1) : (N) recommendations`
- `recommendation_requests (1) : (N) recommendations`
- `recommendation_requests (1) : (N) saved_courses`

## 컬럼명 매핑

| 문서/API 표기       | DB 컬럼명            |
| ------------------- | -------------------- |
| `preferredRegion`   | `preferred_region`   |
| `preferredCategory` | `preferred_category` |
| `requestText`       | `request_text`       |
| `transportMode`     | `transport_mode`     |
| `publicDataId`      | `public_data_id`     |
| `courseOrder`       | `course_order`       |
| `travelMinutes`     | `travel_minutes`     |
| `estimatedCost`     | `estimated_cost`     |
| `savedAt`           | `saved_at`           |
| `createdAt`         | `created_at`         |
| `updatedAt`         | `updated_at`         |

## Supabase 구현 요소

### 1. Auth 연동

- 회원가입 시 `auth.users`에 사용자가 생성됩니다.
- `handle_auth_user_created()` 트리거가 자동으로 `profiles` 레코드를 생성합니다.
- `nickname`은 `raw_user_meta_data.nickname`이 있으면 그것을 사용하고, 없으면 이메일 앞부분을 기본값으로 사용합니다.

### 2. `updated_at` 자동 갱신

- `profiles`
- `public_data`
- `recommendation_requests`

위 3개 테이블은 `set_current_timestamp_updated_at()` 트리거 함수로 수정 시각을 자동 업데이트합니다.

### 3. RLS 정책

아래 테이블은 RLS가 활성화됩니다.

- `profiles`
- `public_data`
- `recommendation_requests`
- `recommendations`
- `saved_courses`

정책 방향은 다음과 같습니다.

- `profiles`: 본인 조회/수정만 허용
- `public_data`: 인증 사용자 읽기 허용
- `recommendation_requests`: 본인 데이터만 조회/생성/수정
- `recommendations`: 본인 데이터만 조회/생성
- `saved_courses`: 본인 데이터만 조회/생성/수정/삭제

## 인덱스

- `idx_profiles_preferred_region`
- `idx_profiles_preferred_category`
- `idx_public_data_region`
- `idx_public_data_category`
- `idx_public_data_title_trgm`
- `idx_recommendation_requests_user_created_at`
- `idx_recommendations_user_request`
- `idx_recommendations_public_data`
- `idx_saved_courses_user_saved_at`

## 파일 위치

- 마이그레이션: [supabase/migrations/20260506_initial_schema.sql](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/supabase/migrations/20260506_initial_schema.sql)
- 시드 데이터: [supabase/seed.sql](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/supabase/seed.sql)

## 적용 순서

1. Supabase 프로젝트 생성
2. 프로젝트의 DB 연결 문자열을 `DATABASE_URL`에 설정
3. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 설정
4. 마이그레이션 SQL 적용
5. `seed.sql` 적용
6. 백엔드에서 `pg` 또는 `supabase-js`로 연결

## 현재 코드 연결 지점

- `src/config/db.ts`: Supabase Postgres 직접 연결용 `pg.Pool`
- `src/config/supabase.ts`: Supabase REST/Auth/Admin 클라이언트 생성
- `src/repositories/user.repository.ts`
- `src/repositories/publicData.repository.ts`
- `src/repositories/recommendation.repository.ts`

## 미정 항목

- 코스 결과를 별도 `courses` 테이블로 분리할지 여부
- 추천 결과에 혼잡도/안전성/비용 점수 상세를 JSONB로 저장할지 여부
- 장소 카테고리와 지역을 별도 기준 테이블로 정규화할지 여부
- Supabase Storage를 이미지/썸네일 관리에 사용할지 여부
