# SeoulMate_BE Database

## 개요

이 문서는 `SeoulMate_BE`의 현재 PostgreSQL DB 스키마를 자세히 설명하는 문서입니다.
현재 배포 전제는 아래와 같습니다.

- 애플리케이션 서버: `EC2`
- 데이터베이스: `RDS PostgreSQL`
- 백엔드 런타임: `Express + TypeScript`

이 문서에서는 단순히 테이블 목록만 나열하지 않고, 아래 항목까지 함께 설명합니다.

- 왜 이 테이블들이 필요한지
- 각 테이블이 어떤 기능을 담당하는지
- 서울 열린데이터 API와 DB가 어떻게 연결되는지
- 어떤 데이터는 주기적으로 저장하고, 어떤 데이터는 요청 시점에 호출하는지
- 현재 구조가 추천 서비스에 왜 적합한지

## 설계 방향

현재 DB 구조의 핵심 방향은 아래와 같습니다.

### 1. 사용자 데이터는 DB에 저장

사용자 계정, 선호 정보, 추천 요청 이력, 저장한 코스는 서비스의 핵심 상태 데이터이므로 반드시 DB에 저장합니다.

### 2. 장소/공간/행사 같은 기본 공공데이터는 DB에 저장

서울 열린데이터 API에서 내려주는 장소/공간/행사 정보는 실시간성이 아주 강한 데이터가 아니라, 주기적으로 적재해도 충분한 데이터입니다.
따라서 이 데이터는 `public_data` 테이블에 저장해 두고 검색/추천 시 재사용합니다.

예:

- 문화공간
- 문화행사
- 공원/산책 장소
- 관광지
- 식품위생업소 기반 맛집/카페 후보

### 3. 실시간 데이터는 요청 시점 호출 또는 짧은 캐시

서울 열린데이터 API 중 실시간 도시데이터, 실시간 인구, 대기환경 같은 데이터는 매 시점 상태가 중요하므로 기본적으로 DB에 영구 저장하지 않습니다.
이런 데이터는 추천 요청 시점에 호출하거나, 짧은 TTL 캐시로 활용하는 것이 더 적절합니다.

즉 현재 구조는:

- 정적/준정적 데이터 -> DB 저장
- 실시간 데이터 -> 호출 시점 조회

이 원칙을 전제로 설계되어 있습니다.

## 전체 흐름

### 공공데이터 적재 흐름

```text
서울 열린데이터 API
  -> 백엔드 수집 스크립트
  -> 응답 파싱 / 정규화
  -> public_data upsert
  -> public_data_sync_runs 기록
```

### 추천 요청 흐름

```text
사용자 요청
  -> recommendation_requests 저장
  -> public_data에서 후보 장소 조회
  -> 필요 시 실시간 외부 API 호출
  -> 점수 계산
  -> recommendations 저장
  -> 필요 시 saved_courses 저장
```

## 왜 `public_data`를 따로 저장하는가

서울 열린데이터 API를 요청할 때마다 직접 호출해서 쓰는 구조도 가능은 합니다.
하지만 현재 프로젝트에서는 그 방식보다 `public_data`를 별도 저장하는 방식이 더 적합합니다.

이유:

- 같은 장소를 매번 다시 외부 API에서 가져올 필요가 없음
- 검색 속도가 빨라짐
- 추천 후보군 필터링이 쉬워짐
- 저장한 코스와 장소 정보를 안정적으로 연결할 수 있음
- 외부 API 장애가 나도 기본 장소 풀은 유지 가능
- 추천 로직에서 장소 기본정보를 재가공하기 쉬움

## 테이블 구성

현재 핵심 테이블은 아래 6개입니다.

- `users`
- `public_data`
- `recommendation_requests`
- `recommendations`
- `saved_courses`
- `public_data_sync_runs`

## 1. `users`

## 역할

서비스 사용자 계정을 저장하는 테이블입니다.
로그인 이메일, 비밀번호 해시, 닉네임, 선호 지역/카테고리를 보관합니다.

## 왜 필요한가

- 로그인 대상 사용자 정보 저장
- 선호 지역/카테고리 기반 추천 개인화
- 추천 요청/저장 코스의 소유자 식별

## 컬럼

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

## 메모

- `password_hash`만 저장하며 평문 비밀번호는 저장하지 않습니다.
- `preferred_region`, `preferred_category`는 회원가입 직후 비어 있을 수 있으므로 nullable입니다.

## 2. `public_data`

## 역할

서울 열린데이터 API 및 외부 공공데이터에서 수집한 장소/공간/행사/시설 기본 정보를 저장하는 테이블입니다.

이 테이블은 현재 서비스에서 “추천 후보 장소 풀” 역할을 합니다.

## 왜 필요한가

- 장소 검색 API의 기본 데이터 소스
- 추천 후보군 조회 대상
- 저장 코스와 추천 결과가 참조하는 장소 마스터
- 외부 API 응답을 우리 서비스 구조로 정규화하는 저장소

## 컬럼

| 컬럼               | 타입            | 제약조건                                | 설명                  |
| ------------------ | --------------- | --------------------------------------- | --------------------- |
| `id`               | `BIGSERIAL`     | `PK`                                    | 장소 고유 ID          |
| `source_dataset`   | `VARCHAR(100)`  | `NULL`                                  | 원천 데이터셋 분류명  |
| `source_record_id` | `VARCHAR(150)`  | `NULL`                                  | 원천 데이터 레코드 ID |
| `title`            | `VARCHAR(255)`  | `NOT NULL`                              | 장소/콘텐츠명         |
| `category`         | `VARCHAR(100)`  | `NOT NULL`                              | 카테고리              |
| `region`           | `VARCHAR(50)`   | `NULL`                                  | 자치구/지역           |
| `address`          | `TEXT`          | `NULL`                                  | 주소                  |
| `latitude`         | `NUMERIC(10,7)` | `NULL`                                  | 위도                  |
| `longitude`        | `NUMERIC(10,7)` | `NULL`                                  | 경도                  |
| `source`           | `VARCHAR(100)`  | `NULL`                                  | 데이터 출처           |
| `source_url`       | `TEXT`          | `NULL`                                  | 원본 링크             |
| `metadata`         | `JSONB`         | `NOT NULL`, `DEFAULT '{}'`              | 원본 부가 정보        |
| `created_at`       | `TIMESTAMP`     | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 생성 시각             |
| `updated_at`       | `TIMESTAMP`     | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 수정 시각             |

## 어떤 공공데이터가 여기에 들어오는가

현재 설계 기준으로 아래 성격의 데이터가 `public_data`에 적재됩니다.

- 문화행사
- 문화공간
- 관광지
- 공원/산책 장소
- 식품위생업소 기반 맛집/카페 후보
- 공공서비스예약 기반 공간/프로그램

즉 공공데이터 중에서 “기본 장소 마스터로 재사용 가능한 데이터”가 들어옵니다.

## 어떻게 적재되는가

서울 열린데이터 API 응답에서 아래 식으로 매핑합니다.

| 원천 API 필드 예시     | 저장 대상                  |
| ---------------------- | -------------------------- |
| 장소명/행사명          | `title`                    |
| 자치구/지역명          | `region`                   |
| 주소                   | `address`                  |
| 위도                   | `latitude`                 |
| 경도                   | `longitude`                |
| 원천 ID                | `source_record_id`         |
| API 이름/데이터셋 이름 | `source`, `source_dataset` |
| 나머지 세부 필드       | `metadata`                 |

## 왜 `metadata`가 필요한가

서울 열린데이터 API마다 응답 필드 구조가 다르기 때문입니다.
모든 필드를 정규 컬럼으로 만들면 스키마가 지나치게 복잡해지므로, 공통적으로 자주 쓰는 필드만 정규 컬럼에 두고 나머지는 `metadata`에 JSON 형태로 저장합니다.

예:

- 행사 시작일/종료일
- 업종 코드
- 운영 시간
- 전화번호
- 예약 링크
- 행사 소개 문구

## 3. `recommendation_requests`

## 역할

사용자가 추천을 요청한 “상위 요청 1건”을 저장하는 테이블입니다.
현재 서비스 관점에서는 하나의 추천 코스 세션 또는 추천 실행 단위라고 볼 수 있습니다.

## 왜 필요한가

- 사용자가 언제 어떤 조건으로 추천을 요청했는지 기록
- 추천 결과(`recommendations`)를 묶는 부모 엔터티 역할
- 저장 코스(`saved_courses`)가 참조하는 상위 객체 역할

## 컬럼

| 컬럼                 | 타입           | 제약조건                                | 설명                       |
| -------------------- | -------------- | --------------------------------------- | -------------------------- |
| `id`                 | `BIGSERIAL`    | `PK`                                    | 추천 요청 ID               |
| `user_id`            | `BIGINT`       | `NOT NULL`, `FK -> users.id`            | 요청 사용자                |
| `request_text`       | `TEXT`         | `NULL`                                  | 자유 입력 요청 문장        |
| `preferred_region`   | `VARCHAR(50)`  | `NULL`                                  | 요청 시점 선호 지역        |
| `preferred_category` | `VARCHAR(100)` | `NULL`                                  | 요청 시점 선호 카테고리    |
| `budget`             | `INTEGER`      | `NULL`                                  | 예산                       |
| `companion`          | `VARCHAR(50)`  | `NULL`                                  | 동행 유형                  |
| `transport_mode`     | `VARCHAR(30)`  | `NULL`                                  | 이동 수단                  |
| `status`             | `VARCHAR(20)`  | `NOT NULL`                              | `pending/completed/failed` |
| `created_at`         | `TIMESTAMP`    | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 생성 시각                  |
| `updated_at`         | `TIMESTAMP`    | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 수정 시각                  |

## 의미

예를 들어 사용자가

“성북구에서 한적하게 산책하고 카페 들를 수 있는 코스 추천해줘”

라고 요청하면, 그 요청 1건이 `recommendation_requests`에 저장됩니다.

그 뒤 이 요청에 속한 실제 장소 추천 결과 여러 건이 `recommendations`에 저장됩니다.

## 4. `recommendations`

## 역할

추천 요청 1건 아래에 달리는 개별 추천 장소 결과를 저장하는 테이블입니다.

즉:

- `recommendation_requests` = 상위 추천 세션
- `recommendations` = 그 세션 안의 개별 장소 결과

## 왜 필요한가

- 추천 결과를 이력으로 남길 수 있음
- 저장 코스 구성 시 재활용 가능
- 추후 추천 품질 분석 및 점수 추적 가능

## 컬럼

| 컬럼             | 타입           | 제약조건                                       | 설명           |
| ---------------- | -------------- | ---------------------------------------------- | -------------- |
| `id`             | `BIGSERIAL`    | `PK`                                           | 추천 결과 ID   |
| `request_id`     | `BIGINT`       | `NOT NULL`, `FK -> recommendation_requests.id` | 상위 추천 요청 |
| `user_id`        | `BIGINT`       | `NOT NULL`, `FK -> users.id`                   | 사용자 ID      |
| `public_data_id` | `BIGINT`       | `NOT NULL`, `FK -> public_data.id`             | 추천된 장소 ID |
| `course_order`   | `INTEGER`      | `NULL`                                         | 코스 내 순서   |
| `score`          | `NUMERIC(5,2)` | `NOT NULL`                                     | 추천 점수      |
| `reason`         | `TEXT`         | `NULL`                                         | 추천 사유      |
| `travel_minutes` | `INTEGER`      | `NULL`                                         | 예상 이동 시간 |
| `estimated_cost` | `INTEGER`      | `NULL`                                         | 예상 비용      |
| `created_at`     | `TIMESTAMP`    | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP`        | 생성 시각      |

## 점수는 어디서 계산되는가

현재 설계상 점수 계산은 백엔드 서비스 레이어에서 수행하고, 계산 결과만 이 테이블에 저장합니다.

즉:

1. `public_data`에서 후보 장소 조회
2. 필요 시 실시간 데이터 호출
3. 점수 계산
4. 최종 점수와 사유를 `recommendations`에 저장

## 실시간 API와의 연결

`recommendations`는 실시간 API 결과를 영구 저장하는 테이블은 아닙니다.
대신 실시간 데이터로 계산된 최종 결과를 기록하는 역할을 합니다.

예:

- 실시간 혼잡도 반영 후 낮아진 점수
- 대기질이 나빠서 실내 장소가 우선된 이유

이런 판단 결과를 `score`, `reason`, `travel_minutes`, `estimated_cost`에 담습니다.

## 5. `saved_courses`

## 역할

사용자가 저장해 둔 추천 코스를 관리하는 테이블입니다.

## 왜 필요한가

- 추천 결과를 나중에 다시 조회하기 위해
- 사용자가 마음에 든 추천 요청 단위를 북마크하기 위해
- 프런트의 “저장한 코스 목록” 기능 지원

## 컬럼

| 컬럼         | 타입        | 제약조건                                       | 설명             |
| ------------ | ----------- | ---------------------------------------------- | ---------------- |
| `id`         | `BIGSERIAL` | `PK`                                           | 저장 ID          |
| `user_id`    | `BIGINT`    | `NOT NULL`, `FK -> users.id`                   | 저장 사용자      |
| `request_id` | `BIGINT`    | `NOT NULL`, `FK -> recommendation_requests.id` | 저장한 추천 요청 |
| `notes`      | `TEXT`      | `NULL`                                         | 사용자 메모      |
| `saved_at`   | `TIMESTAMP` | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP`        | 저장 시각        |

## 의미

여기서는 장소 하나를 저장하는 것이 아니라, 상위 추천 요청 단위(`recommendation_requests`)를 저장합니다.
그래서 사용자가 저장한 코스를 다시 열면 그 아래 `recommendations` 여러 건을 묶어서 보여줄 수 있습니다.

## 6. `public_data_sync_runs`

## 역할

공공데이터 적재/동기화 작업 이력을 저장하는 운영성 테이블입니다.

## 왜 필요한가

- 어떤 API를 언제 적재했는지 확인
- 몇 건을 신규 적재했는지 추적
- 실패 시 원인 확인
- 주기 배치 실행 로그 관리

## 컬럼

| 컬럼             | 타입           | 제약조건                                | 설명                       |
| ---------------- | -------------- | --------------------------------------- | -------------------------- |
| `id`             | `BIGSERIAL`    | `PK`                                    | 실행 ID                    |
| `source`         | `VARCHAR(100)` | `NOT NULL`                              | 동기화 대상 출처           |
| `status`         | `VARCHAR(20)`  | `NOT NULL`                              | `started/completed/failed` |
| `imported_count` | `INTEGER`      | `NOT NULL`, `DEFAULT 0`                 | 신규 적재 건수             |
| `updated_count`  | `INTEGER`      | `NOT NULL`, `DEFAULT 0`                 | 갱신 건수                  |
| `error_message`  | `TEXT`         | `NULL`                                  | 실패 메시지                |
| `started_at`     | `TIMESTAMP`    | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` | 시작 시각                  |
| `finished_at`    | `TIMESTAMP`    | `NULL`                                  | 종료 시각                  |

## 공공데이터 API와의 연결

예를 들어 `문화공간 정보`, `문화행사 정보`, `식품위생업소 현황`을 배치 적재할 때:

1. 작업 시작 시 `started`
2. 적재 성공 후 `completed`
3. 실패 시 `failed + error_message`

형태로 기록할 수 있습니다.

## 테이블 관계

아래 관계를 가집니다.

- `users (1) : (N) recommendation_requests`
- `users (1) : (N) recommendations`
- `users (1) : (N) saved_courses`
- `public_data (1) : (N) recommendations`
- `recommendation_requests (1) : (N) recommendations`
- `recommendation_requests (1) : (N) saved_courses`

## 컬럼명 매핑

API 또는 프런트에서는 camelCase를 쓰고, DB에서는 snake_case를 사용합니다.

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

## 공공데이터 API와 DB의 연결 방식

현재 프로젝트는 공공데이터를 아래 2가지 방식으로 다룹니다.

## 1. 주기 적재형 데이터

이 데이터는 배치/스크립트로 주기적으로 수집해서 DB에 저장합니다.

대상 예시:

- 문화공간
- 문화행사
- 관광지
- 식품위생업소
- 공공서비스예약 정보

처리 방식:

```text
서울 열린데이터 API 호출
-> 응답 파싱
-> 공통 필드 정규화
-> public_data upsert
-> public_data_sync_runs 기록
```

이 역할은 향후 아래 파일들이 담당합니다.

- `src/clients/seoulOpenData.client.ts`
- `scripts/syncPublicData.ts`
- `src/repositories/publicData.repository.ts`

## 2. 실시간 조회형 데이터

이 데이터는 추천 시점에 호출하거나 짧게 캐시합니다.

대상 예시:

- 실시간 도시데이터
- 실시간 인구/혼잡도
- 대기질
- 날씨

처리 방식:

```text
추천 요청 발생
-> public_data에서 후보 장소 조회
-> 실시간 외부 API 호출
-> 점수 보정
-> recommendations 저장
```

## 왜 실시간 데이터는 DB에 기본 저장하지 않는가

- 값이 자주 바뀜
- 매 시점 최신성이 중요함
- 오래 저장된 값은 추천 품질에 오히려 방해가 됨

필요하면 나중에 캐시 테이블을 따로 둘 수 있지만, 현재 설계에서는 영구 마스터 테이블인 `public_data`에 넣지 않는 방향이 맞습니다.

## 현재 repository와의 연결

현재 DB 구조는 아래 repository 구현과 연결됩니다.

- `src/repositories/user.repository.ts`
  - `users` 조회/생성/수정
- `src/repositories/publicData.repository.ts`
  - `public_data` 조회/검색/upsert
- `src/repositories/recommendation.repository.ts`
  - `recommendation_requests`, `recommendations`, `saved_courses` 처리

## 현재 구조의 장점

- 사용자 데이터와 장소 데이터가 분리되어 있음
- 장소 마스터를 재사용 가능
- 추천 결과 이력을 저장 가능
- 공공데이터 배치 적재와 추천 API 요청 흐름을 분리 가능
- 실시간 API 호출 전략을 나중에 바꿔도 기본 마스터 구조는 유지 가능

## 현재 구조에서 주의할 점

설계 방향은 맞지만, 운영 전에는 아래를 추가 점검해야 합니다.

- `public_data` 중복 방지 키 설계
- `recommendation_requests`와 `recommendations`의 사용자 소유권 일관성
- 검색 인덱스와 실제 검색 쿼리 일치 여부
- 추후 필요 시 `TIMESTAMPTZ` 전환 여부

## 관련 파일

- 마이그레이션: [db/migrations/20260506_initial_schema.sql](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/db/migrations/20260506_initial_schema.sql)
- 시드 데이터: [db/seed.sql](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/db/seed.sql)
- 공공데이터 API 정리: [PUBLIC_DATA_APIS.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/PUBLIC_DATA_APIS.md)
- 구조 문서: [STRUCTURE.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/STRUCTURE.md)

## 적용 순서

1. RDS PostgreSQL 생성
2. EC2 -> RDS 접근 허용
3. `.env`에 DB 연결 정보 설정
4. 마이그레이션 SQL 적용
5. 시드 데이터 적용
6. 공공데이터 적재 스크립트 구현
7. `public_data` 채우기
8. 추천/조회 API 구현
