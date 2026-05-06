# SeoulMate_BE Database

## 개요

이 문서는 `SeoulMate_BE`의 일반 PostgreSQL 기반 데이터베이스 설계를 설명합니다.
배포 기준은 `EC2`에서 백엔드 서버를 실행하고, `RDS PostgreSQL`을 사용하는 구조를 전제로 합니다.

현재 핵심 테이블은 아래와 같습니다.

- `users`
- `public_data`
- `recommendation_requests`
- `recommendations`
- `saved_courses`
- `public_data_sync_runs`

## 설계 방향

- 인증은 애플리케이션 서버에서 직접 처리
- 사용자 계정은 `users` 테이블에서 관리
- 장소 원천 데이터는 `public_data`에 적재
- 추천은 요청 단위와 결과 단위로 분리 저장
- 저장 코스는 `saved_courses`로 관리
- 운영성 동기화 이력은 `public_data_sync_runs`에 기록

## 테이블 요약

### `users`

| 컬럼                 | 타입           | 제약조건                                | 설명           |
| -------------------- | -------------- | --------------------------------------- | -------------- |
| `id`                 | `BIGSERIAL`    | `PK`                                    | 사용자 고유 ID |
| `email`              | `VARCHAR(255)` | `NOT NULL`, `UNIQUE`                    | 로그인 이메일  |
| `password_hash`      | `VARCHAR(255)` | `NOT NULL`                              | 비밀번호 해시  |
| `nickname`           | `VARCHAR(50)`  | `NOT NULL`, `UNIQUE`                    | 닉네임         |
| `preferred_region`   | `VARCHAR(50)`  | `NULL`                                  | 선호 지역      |
| `preferred_category` | `VARCHAR(100)` | `NULL`                                  | 선호 카테고리  |
| `created_at`         | `TIMESTAMP`    | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 생성 시각      |
| `updated_at`         | `TIMESTAMP`    | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 수정 시각      |

### `public_data`

| 컬럼               | 타입            | 제약조건                                | 설명            |
| ------------------ | --------------- | --------------------------------------- | --------------- |
| `id`               | `BIGSERIAL`     | `PK`                                    | 장소 고유 ID    |
| `source_dataset`   | `VARCHAR(100)`  | `NULL`                                  | 데이터셋 분류명 |
| `source_record_id` | `VARCHAR(150)`  | `NULL`                                  | 원천 레코드 ID  |
| `title`            | `VARCHAR(255)`  | `NOT NULL`                              | 장소/콘텐츠명   |
| `category`         | `VARCHAR(100)`  | `NOT NULL`                              | 카테고리        |
| `region`           | `VARCHAR(50)`   | `NULL`                                  | 지역            |
| `address`          | `TEXT`          | `NULL`                                  | 주소            |
| `latitude`         | `NUMERIC(10,7)` | `NULL`                                  | 위도            |
| `longitude`        | `NUMERIC(10,7)` | `NULL`                                  | 경도            |
| `source`           | `VARCHAR(100)`  | `NULL`                                  | 데이터 출처     |
| `source_url`       | `TEXT`          | `NULL`                                  | 원본 URL        |
| `metadata`         | `JSONB`         | `NOT NULL`, `DEFAULT '{}'`              | 부가 메타데이터 |
| `created_at`       | `TIMESTAMP`     | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 생성 시각       |
| `updated_at`       | `TIMESTAMP`     | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 수정 시각       |

### `recommendation_requests`

| 컬럼                 | 타입           | 제약조건                                | 설명                       |
| -------------------- | -------------- | --------------------------------------- | -------------------------- |
| `id`                 | `BIGSERIAL`    | `PK`                                    | 추천 요청 ID               |
| `user_id`            | `BIGINT`       | `NOT NULL`, `FK -> users.id`            | 요청 사용자                |
| `request_text`       | `TEXT`         | `NULL`                                  | 자유 입력 요청 문장        |
| `preferred_region`   | `VARCHAR(50)`  | `NULL`                                  | 요청 시점 지역 선호        |
| `preferred_category` | `VARCHAR(100)` | `NULL`                                  | 요청 시점 카테고리 선호    |
| `budget`             | `INTEGER`      | `NULL`                                  | 예산                       |
| `companion`          | `VARCHAR(50)`  | `NULL`                                  | 동행 유형                  |
| `transport_mode`     | `VARCHAR(30)`  | `NULL`                                  | 이동 수단                  |
| `status`             | `VARCHAR(20)`  | `NOT NULL`                              | `pending/completed/failed` |
| `created_at`         | `TIMESTAMP`    | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 생성 시각                  |
| `updated_at`         | `TIMESTAMP`    | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 수정 시각                  |

### `recommendations`

| 컬럼             | 타입           | 제약조건                                       | 설명           |
| ---------------- | -------------- | ---------------------------------------------- | -------------- |
| `id`             | `BIGSERIAL`    | `PK`                                           | 추천 결과 ID   |
| `request_id`     | `BIGINT`       | `NOT NULL`, `FK -> recommendation_requests.id` | 상위 추천 요청 |
| `user_id`        | `BIGINT`       | `NOT NULL`, `FK -> users.id`                   | 사용자 ID      |
| `public_data_id` | `BIGINT`       | `NOT NULL`, `FK -> public_data.id`             | 추천 장소 ID   |
| `course_order`   | `INTEGER`      | `NULL`                                         | 코스 내 순서   |
| `score`          | `NUMERIC(5,2)` | `NOT NULL`                                     | 추천 점수      |
| `reason`         | `TEXT`         | `NULL`                                         | 추천 사유      |
| `travel_minutes` | `INTEGER`      | `NULL`                                         | 예상 이동 시간 |
| `estimated_cost` | `INTEGER`      | `NULL`                                         | 예상 비용      |
| `created_at`     | `TIMESTAMP`    | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP`        | 생성 시각      |

### `saved_courses`

| 컬럼         | 타입        | 제약조건                                       | 설명             |
| ------------ | ----------- | ---------------------------------------------- | ---------------- |
| `id`         | `BIGSERIAL` | `PK`                                           | 저장 ID          |
| `user_id`    | `BIGINT`    | `NOT NULL`, `FK -> users.id`                   | 저장 사용자      |
| `request_id` | `BIGINT`    | `NOT NULL`, `FK -> recommendation_requests.id` | 저장한 추천 요청 |
| `notes`      | `TEXT`      | `NULL`                                         | 사용자 메모      |
| `saved_at`   | `TIMESTAMP` | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP`        | 저장 시각        |

### `public_data_sync_runs`

| 컬럼             | 타입           | 제약조건                                | 설명                       |
| ---------------- | -------------- | --------------------------------------- | -------------------------- |
| `id`             | `BIGSERIAL`    | `PK`                                    | 실행 ID                    |
| `source`         | `VARCHAR(100)` | `NOT NULL`                              | 동기화 대상 출처           |
| `status`         | `VARCHAR(20)`  | `NOT NULL`                              | `started/completed/failed` |
| `imported_count` | `INTEGER`      | `NOT NULL`, `DEFAULT 0`                 | 신규 적재 수               |
| `updated_count`  | `INTEGER`      | `NOT NULL`, `DEFAULT 0`                 | 갱신 수                    |
| `error_message`  | `TEXT`         | `NULL`                                  | 실패 메시지                |
| `started_at`     | `TIMESTAMP`    | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 시작 시각                  |
| `finished_at`    | `TIMESTAMP`    | `NULL`                                  | 종료 시각                  |

## 관계

- `users (1) : (N) recommendation_requests`
- `users (1) : (N) recommendations`
- `users (1) : (N) saved_courses`
- `public_data (1) : (N) recommendations`
- `recommendation_requests (1) : (N) recommendations`
- `recommendation_requests (1) : (N) saved_courses`

## 컬럼명 매핑

| 문서/API 표기       | DB 컬럼명            |
| ------------------- | -------------------- |
| `password`          | `password_hash`      |
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

## 운영 메모

- `users.password_hash`에는 해시만 저장해야 합니다.
- `public_data`는 원천 API 식별을 위해 `source`, `source_dataset`, `source_record_id`를 함께 유지합니다.
- `recommendation_requests`는 코스 상위 단위 역할을 합니다.
- `recommendations`는 개별 장소 결과를 저장합니다.
- `saved_courses`는 사용자별 저장 코스 목록입니다.
- `public_data_sync_runs`는 배치 적재 로그입니다.

## 파일 위치

- 마이그레이션: [db/migrations/20260506_initial_schema.sql](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/db/migrations/20260506_initial_schema.sql)
- 시드 데이터: [db/seed.sql](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/db/seed.sql)

## 적용 순서

1. RDS PostgreSQL 인스턴스 생성
2. 보안 그룹에서 EC2 -> RDS 접근 허용
3. `DATABASE_URL` 또는 `POSTGRES_*` 환경 변수 설정
4. 마이그레이션 SQL 적용
5. `seed.sql` 적용
6. EC2에서 백엔드 실행

## 현재 코드 연결 지점

- `src/config/db.ts`
- `src/repositories/user.repository.ts`
- `src/repositories/publicData.repository.ts`
- `src/repositories/recommendation.repository.ts`
