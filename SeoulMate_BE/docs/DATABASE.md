# Database Reference

## 목차

- [구성 개요](#구성-개요)
- [테이블 스키마](#테이블-스키마)
  - [users](#users)
  - [public_data](#public_data)
  - [public_data_sync_runs](#public_data_sync_runs)
  - [recommendation_requests](#recommendation_requests)
  - [recommendations](#recommendations)
  - [saved_courses](#saved_courses)
- [공개데이터 수집 파이프라인](#공개데이터-수집-파이프라인)
  - [아키텍처](#아키텍처)
  - [데이터셋별 상세 명세](#데이터셋별-상세-명세)
- [Sync 실행 방법](#sync-실행-방법)
- [좌표계 변환](#좌표계-변환)
- [마이그레이션](#마이그레이션)

---

## 구성 개요

- **DB 엔진**: PostgreSQL 16 (AWS RDS, arm64/Graviton)
- **접속**: EC2 → SSH 터널 → RDS (로컬 개발 시 `127.0.0.1:5432`)
- **SSL**: 필수 (`DATABASE_SSL=true`)
- **주요 테이블**

| 테이블                    | 역할                        |
| ------------------------- | --------------------------- |
| `users`                   | 사용자 계정 및 선호 정보    |
| `public_data`             | 서울 공개데이터 통합 저장소 |
| `public_data_sync_runs`   | 데이터 수집 실행 이력       |
| `recommendation_requests` | AI 추천 요청                |
| `recommendations`         | 추천 결과 (코스 구성)       |
| `saved_courses`           | 사용자가 저장한 코스        |

---

## 테이블 스키마

### users

```sql
id               bigserial  PK
email            varchar(255)  UNIQUE NOT NULL
password_hash    varchar(255)  NOT NULL
nickname         varchar(50)   UNIQUE NOT NULL
preferred_region varchar(50)
preferred_category varchar(100)
created_at       timestamp NOT NULL DEFAULT now()
updated_at       timestamp NOT NULL DEFAULT now()
```

- `preferred_region`: 구 단위 (예: `종로구`)
- `preferred_category`: `public_data.category` 값과 동일 도메인

---

### public_data

서울 공개데이터 API 10개 소스를 정규화해 하나의 테이블에 저장하는 통합 저장소.

```sql
id               bigserial  PK
source_dataset   varchar(100)   -- 원본 API/파일 식별자 (예: LOCALDATA_072404)
source_record_id varchar(150)   -- 원본 레코드 고유 키
title            varchar(255)  NOT NULL
category         varchar(100)  NOT NULL   -- DATASET_CATEGORY 상수값
region           varchar(50)              -- 구 단위 (서울특별시 내)
address          text
latitude         numeric(10,7)
longitude        numeric(10,7)            -- WGS84 기준
source           varchar(100)             -- API 출처 레이블
source_url       text                     -- 원본 페이지/API URL
metadata         jsonb NOT NULL DEFAULT '{}'  -- 소스별 추가 필드 전체 보관
created_at       timestamp NOT NULL DEFAULT now()
updated_at       timestamp NOT NULL DEFAULT now()

UNIQUE (source_dataset, source_record_id)
```

**인덱스**

| 인덱스                      | 컬럼                               | 용도                 |
| --------------------------- | ---------------------------------- | -------------------- |
| `idx_public_data_category`  | `category`                         | 카테고리 필터링      |
| `idx_public_data_region`    | `region`                           | 지역 필터링          |
| `idx_public_data_title_tsv` | `to_tsvector('simple', title)` GIN | 한국어 제목 전문검색 |

**트리거**: `updated_at` 자동 갱신 (`set_current_timestamp_updated_at`)

---

### public_data_sync_runs

공개데이터 수집 실행 이력. 성공/실패 여부와 건수를 기록.

```sql
id             bigserial  PK
source         varchar(100) NOT NULL   -- 'initial_public_data_sync' | 'daily_public_data_sync'
status         varchar(20)  NOT NULL   -- 'started' | 'completed' | 'failed'
imported_count integer NOT NULL DEFAULT 0
updated_count  integer NOT NULL DEFAULT 0
error_message  text
started_at     timestamp NOT NULL DEFAULT now()
finished_at    timestamp
```

---

### recommendation_requests

```sql
id                 bigserial  PK
user_id            bigint  NOT NULL  FK → users(id)
request_text       text
preferred_region   varchar(50)
preferred_category varchar(100)
budget             integer  CHECK (>= 0)
companion          varchar(50)
transport_mode     varchar(30)
status             varchar(20)  -- 'pending' | 'completed' | 'failed'
created_at         timestamp
updated_at         timestamp
```

---

### recommendations

```sql
id              bigserial  PK
request_id      bigint  NOT NULL  FK → recommendation_requests(id)
user_id         bigint  NOT NULL  FK → users(id)
public_data_id  bigint  NOT NULL  FK → public_data(id) ON DELETE CASCADE
course_order    integer  CHECK (> 0)
score           numeric(5,2)  NOT NULL  CHECK (0 ~ 100)
reason          text
travel_minutes  integer  CHECK (>= 0)
estimated_cost  integer  CHECK (>= 0)
created_at      timestamp

UNIQUE (request_id, public_data_id)
```

---

### saved_courses

```sql
id          bigserial  PK
user_id     bigint  NOT NULL  FK → users(id)
request_id  bigint  NOT NULL  FK → recommendation_requests(id)
notes       text
saved_at    timestamp NOT NULL DEFAULT now()

UNIQUE (user_id, request_id)
```

---

## 공개데이터 수집 파이프라인

### 아키텍처

```
Seoul Open API (openapi.seoul.go.kr)
Seoul File Data (data.seoul.go.kr CSV)
        │
        ▼
seoulOpenData.client.ts   ← HTTP fetch / CSV parse / 페이지네이션
        │
        ▼
publicData.service.ts     ← 필드 매핑 / 좌표 변환 / 폐업 필터 / 중복 제거
        │
        ├─ upsertDataset()    → publicDataRepository.upsertMany()    [UPSERT]
        └─ replaceDataset()   → publicDataRepository.replaceDataset() [DELETE→INSERT 트랜잭션]
                │
                ▼
        RDS: public_data 테이블
```

**수집 전략 구분**

| 전략             | 대상 데이터셋                                  | 설명                                                   |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `upsertMany`     | 관광 음식/자연/명소, 공원, 문화공간            | 기존 레코드 유지, 신규·변경분만 반영                   |
| `replaceDataset` | 문화행사, 휴게음식점, 일반음식점, 식품위생업소 | 트랜잭션으로 전체 삭제 후 재삽입 → 만료/폐업 자동 정리 |

**Sync 종류**

| npm script                 | 소스 레이블                | 포함 데이터셋         | 실행 시점           |
| -------------------------- | -------------------------- | --------------------- | ------------------- |
| `npm run sync:public-data` | `initial_public_data_sync` | 전체 10개             | 초기 1회 또는 수동  |
| 서버 내부 스케줄러         | `daily_public_data_sync`   | 문화공간 + 문화행사만 | 매일 04:10 KST 자동 |

---

### 데이터셋별 상세 명세

#### 1. 서울 관광 음식 — `TbVwRestaurants`

| 항목      | 값                                                                          |
| --------- | --------------------------------------------------------------------------- |
| API 종류  | Seoul Open API (JSON)                                                       |
| 서비스명  | `TbVwRestaurants`                                                           |
| URL 패턴  | `http://openapi.seoul.go.kr:8088/{key}/json/TbVwRestaurants/{start}/{end}/` |
| 레코드 수 | ~1,246건                                                                    |
| 갱신 전략 | upsertMany                                                                  |
| 폐업 필터 | 없음 (관광 정보라 상태 필드 없음)                                           |

**컬럼 매핑**

| `public_data` 컬럼 | 원본 필드                            | 비고                            |
| ------------------ | ------------------------------------ | ------------------------------- |
| `source_dataset`   | —                                    | 고정값 `"TbVwRestaurants"`      |
| `source_record_id` | `POST_SN`                            |                                 |
| `title`            | `POST_SJ`                            | 최대 255자                      |
| `category`         | —                                    | 고정값 `"서울 관광 음식"`       |
| `region`           | `NEW_ADDRESS` / `ADDRESS`            | 정규식으로 구 추출              |
| `address`          | `NEW_ADDRESS` → `ADDRESS` (fallback) |                                 |
| `latitude`         | —                                    | null (API 미제공)               |
| `longitude`        | —                                    | null (API 미제공)               |
| `source`           | —                                    | 고정값 `"visit_seoul_open_api"` |
| `source_url`       | `POST_URL`                           |                                 |

**metadata 필드**

```json
{
  "sourceLanguage": "ko",
  "originalAddress": "...",
  "newAddress": "...",
  "phone": "...",
  "homepage": "...",
  "useTime": "...",
  "businessDays": "...",
  "closedDays": "...",
  "subwayInfo": "...",
  "tags": "...",
  "description": "...",
  "representativeMenu": "..."
}
```

> `LANG_CODE_ID = "ko"` 행만 수집 (다국어 중 한국어만 저장).

---

#### 2. 서울 관광 자연 — `TbVwNature`

`TbVwRestaurants`와 동일한 구조. category = `"서울 관광 자연"`, ~148건.

---

#### 3. 서울 관광명소 — `TbVwAttractions`

`TbVwRestaurants`와 동일한 구조. category = `"서울 관광명소"`, ~470건.

---

#### 4. 서울 주요 공원 — `SearchParkInfoService`

| 항목      | 값                      |
| --------- | ----------------------- |
| API 종류  | Seoul Open API (JSON)   |
| 서비스명  | `SearchParkInfoService` |
| 레코드 수 | ~133건                  |
| 갱신 전략 | upsertMany              |

**컬럼 매핑**

| `public_data` 컬럼 | 원본 필드                 |
| ------------------ | ------------------------- |
| `source_dataset`   | `"SearchParkInfoService"` |
| `source_record_id` | `SN`                      |
| `title`            | `PARK_NM`                 |
| `category`         | `"서울 주요 공원"`        |
| `region`           | `RGN`                     |
| `address`          | `PARK_ADDR`               |
| `latitude`         | `YCRD`                    |
| `longitude`        | `XCRD`                    |
| `source_url`       | `URL`                     |

**metadata 필드**

```json
{
  "outline": "공원 개요",
  "area": "면적",
  "openDate": "개장일",
  "mainFacility": "주요 시설",
  "mainPlant": "주요 식물",
  "visitRoad": "교통편",
  "usageReference": "이용 안내",
  "image": "이미지 URL",
  "managingDepartment": "관리 부서",
  "phone": "전화번호"
}
```

---

#### 5. 서울 문화공간 — `culturalSpaceInfo`

| 항목      | 값                            |
| --------- | ----------------------------- |
| API 종류  | Seoul Open API (JSON)         |
| 서비스명  | `culturalSpaceInfo`           |
| 레코드 수 | ~1,051건                      |
| 갱신 전략 | upsertMany (일 1회 자동 갱신) |

**컬럼 매핑**

| `public_data` 컬럼 | 원본 필드             |
| ------------------ | --------------------- |
| `source_dataset`   | `"culturalSpaceInfo"` |
| `source_record_id` | `NUM`                 |
| `title`            | `FAC_NAME`            |
| `category`         | `"서울 문화공간"`     |
| `region`           | `GNGU`                |
| `address`          | `ADDR`                |
| `latitude`         | `X_COORD`             |
| `longitude`        | `Y_COORD`             |
| `source_url`       | `HOMEPAGE`            |

**metadata 필드**

```json
{
  "subjectCode": "분류코드",
  "phone": "전화번호",
  "openHour": "운영시간",
  "entranceFee": "입장료",
  "closedDay": "휴관일",
  "mainImage": "대표 이미지",
  "etcDescription": "기타 설명",
  "facilityDescription": "시설 설명",
  "entranceFree": "무료 여부",
  "subway": "지하철 정보",
  "busStop": "버스 정류장",
  "blueBus": "파란버스 정보"
}
```

---

#### 6. 서울 문화행사 — `culturalEventInfo`

| 항목      | 값                                                        |
| --------- | --------------------------------------------------------- |
| API 종류  | Seoul Open API (JSON)                                     |
| 서비스명  | `culturalEventInfo`                                       |
| 레코드 수 | ~3,904건 (현재 진행·예정 행사)                            |
| 갱신 전략 | **replaceDataset** (매일 전체 교체 → 종료 행사 자동 삭제) |

**컬럼 매핑**

| `public_data` 컬럼 | 원본 필드                          | 비고                          |
| ------------------ | ---------------------------------- | ----------------------------- |
| `source_dataset`   | `"culturalEventInfo"`              |                               |
| `source_record_id` | `HMPG_ADDR` → `{TITLE}-{STRTDATE}` | URL이 없으면 제목+시작일 조합 |
| `title`            | `TITLE`                            |                               |
| `category`         | `"서울 문화행사"`                  |                               |
| `region`           | `GUNAME`                           |                               |
| `address`          | `PLACE`                            | 행사 장소명                   |
| `latitude`         | `LAT`                              |                               |
| `longitude`        | `LOT`                              |                               |
| `source_url`       | `HMPG_ADDR` → `ORG_LINK`           |                               |

**metadata 필드**

```json
{
  "codeName": "행사 분류",
  "organization": "주관 기관",
  "useTarget": "이용 대상",
  "useFee": "이용 요금",
  "inquiry": "문의처",
  "player": "출연진",
  "program": "프로그램",
  "description": "기타 설명",
  "mainImage": "대표 이미지",
  "registeredDate": "등록일",
  "ticketType": "티켓 종류",
  "startDate": "시작일",
  "endDate": "종료일",
  "themeCode": "테마코드",
  "freeYn": "무료 여부",
  "operatingTime": "공연 시간",
  "displayDate": "일정 표시"
}
```

---

#### 7. 서울시 휴게음식점 인허가 — `LOCALDATA_072405`

| 항목          | 값                                         |
| ------------- | ------------------------------------------ |
| API 종류      | Seoul Open API (JSON)                      |
| 서비스명      | `LOCALDATA_072405`                         |
| 공공데이터 ID | OA-16095                                   |
| 전체 건수     | ~144,000건                                 |
| 활성 건수     | ~36,967건 (폐업·휴업·말소 제외)            |
| 갱신 전략     | **replaceDataset** (전체 교체)             |
| 폐업 필터     | `TRDSTATENM.includes("영업")` 인 행만 저장 |
| 좌표계        | EPSG:5174 → WGS84 변환 (proj4)             |

**컬럼 매핑**

| `public_data` 컬럼 | 원본 필드                         | 비고                 |
| ------------------ | --------------------------------- | -------------------- |
| `source_dataset`   | `"LOCALDATA_072405"`              |                      |
| `source_record_id` | `MGTNO`                           | 관리번호 (전국 고유) |
| `title`            | `BPLCNM`                          | 사업장명             |
| `category`         | `"서울시 휴게음식점 인허가 정보"` |                      |
| `region`           | `RDNWHLADDR` / `SITEWHLADDR`      | 정규식으로 구 추출   |
| `address`          | `RDNWHLADDR` → `SITEWHLADDR`      | 도로명 우선          |
| `latitude`         | `Y` (EPSG:5174 → WGS84 변환)      |                      |
| `longitude`        | `X` (EPSG:5174 → WGS84 변환)      |                      |
| `source_url`       | `HOMEPAGE`                        |                      |

**metadata 필드**

```json
{
  "approvalDate": "인허가일 (APVPERMYMD)",
  "tradeState": "영업상태 (TRDSTATENM)",
  "detailState": "상세상태 (DTLSTATENM)",
  "closeDate": "폐업일 (DCBYMD)",
  "phone": "전화번호 (SITETEL)",
  "siteArea": "사업장면적 (SITEAREA)",
  "lastModifiedAt": "최종수정일 (LASTMODTS)",
  "updatedAt": "데이터갱신일 (UPDATEDT)",
  "businessType": "업태명 (UPTAENM)",
  "sanitizedBusinessType": "위생업태명 (SNTUPTAENM)",
  "coordinateX5174": "원본 X 좌표 (EPSG:5174)",
  "coordinateY5174": "원본 Y 좌표 (EPSG:5174)",
  "waterSupplyFacility": "급수시설 (WTRSPLYFACILSENM)",
  "totalFacilityScale": "총규모 (FACILTOTSCP)"
}
```

> 카페, 패스트푸드, 아이스크림, 분식 등 간이 음식 업종 포함.

---

#### 8. 서울시 일반음식점 인허가 — `LOCALDATA_072404`

`LOCALDATA_072405`와 동일한 구조.

| 항목          | 값                                |
| ------------- | --------------------------------- |
| 공공데이터 ID | OA-16094                          |
| 전체 건수     | ~532,000건                        |
| 활성 건수     | ~120,649건                        |
| category      | `"서울시 일반음식점 인허가 정보"` |

> 한식, 중식, 일식, 양식, 뷔페 등 일반 음식점 포함. `MGTNO`가 `LOCALDATA_072405`와 겹치지 않으므로 두 데이터셋 간 중복 없음.

---

#### 9. 서울시 식품위생업소 현황 — `OA-13663`

| 항목          | 값                                                                                |
| ------------- | --------------------------------------------------------------------------------- |
| API 종류      | CSV 파일 다운로드 (EUC-KR 인코딩)                                                 |
| 다운로드 URL  | `https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do`                    |
| 공공데이터 ID | OA-13663                                                                          |
| 전체 건수     | ~24,000건 (파일 내)                                                               |
| 저장 건수     | ~10,018건                                                                         |
| 갱신 전략     | **replaceDataset** (전체 교체)                                                    |
| 폐업 필터     | `폐업일자` 컬럼이 비어 있는 행만 저장                                             |
| 중복 제거     | 업종명이 `"일반음식점"` 또는 `"휴게음식점"`인 행 제외 → 인허가 데이터와 중복 방지 |
| 인코딩 처리   | `TextDecoder("euc-kr")` 로 디코딩 후 CSV 파싱                                     |

**컬럼 매핑**

| `public_data` 컬럼 | 원본 CSV 컬럼                                   | 비고                                |
| ------------------ | ----------------------------------------------- | ----------------------------------- |
| `source_dataset`   | —                                               | 고정값 `"OA-13663"`                 |
| `source_record_id` | `{시군구코드}-{업종코드}-{년도}-{업소일련번호}` | 4개 필드 조합으로 전국 고유 키 구성 |
| `title`            | `업소명`                                        |                                     |
| `category`         | —                                               | 고정값 `"서울시 식품위생업소 현황"` |
| `region`           | `소재지도로명` / `소재지지번`                   | 정규식으로 구 추출                  |
| `address`          | `소재지도로명` → `소재지지번`                   | 도로명 우선                         |
| `latitude`         | —                                               | null (CSV 미제공)                   |
| `longitude`        | —                                               | null (CSV 미제공)                   |
| `source`           | —                                               | `"seoul_file_data"`                 |
| `source_url`       | —                                               | 공공데이터 목록 페이지 URL          |

**metadata 필드**

```json
{
  "fileName": "다운로드 파일명",
  "districtCode": "시군구코드",
  "businessCode": "업종코드",
  "year": "년도",
  "serialNumber": "업소일련번호",
  "businessType": "업종명",
  "permitDate": "허가신고일",
  "landAddress": "소재지지번",
  "roadAddress": "소재지도로명",
  "businessAreaSquareMeter": "영업장면적(㎡)",
  "administrativeDong": "행정동명",
  "businessStatusName": "업태명",
  "waterSupply": "급수시설",
  "locationType": "업소위치",
  "exemplaryRestaurantYn": "모범음식점여부",
  "domesticOrForeign": "내외국인구분",
  "nationality": "국적"
}
```

> 유흥주점, 집단급식소, 즉석판매제조가공업 등 인허가 데이터에 없는 기타 식품업소 포함.

---

#### 10. 서울시 야경명소 정보 — `viewNightSpot`

| 항목      | 값                    |
| --------- | --------------------- |
| API 종류  | Seoul Open API (JSON) |
| 서비스명  | `viewNightSpot`       |
| 레코드 수 | 51건                  |
| 갱신 전략 | upsertMany            |

**컬럼 매핑**

| `public_data` 컬럼 | 원본 필드                |
| ------------------ | ------------------------ |
| `source_dataset`   | `"viewNightSpot"`        |
| `source_record_id` | `NUM`                    |
| `title`            | `TITLE`                  |
| `category`         | `"서울시 야경명소 정보"` |
| `region`           | `ADDR` (정규식 추출)     |
| `address`          | `ADDR`                   |
| `latitude`         | `LA`                     |
| `longitude`        | `LO`                     |
| `source_url`       | `URL`                    |

**metadata 필드**

```json
{
  "subjectCode": "분류코드",
  "phone": "전화번호",
  "operatingTime": "운영시간",
  "freeYn": "무료 여부",
  "entranceFee": "입장료",
  "description": "설명 (HTML 태그 제거됨)",
  "subway": "지하철 정보",
  "bus": "버스 정보",
  "parkingInfo": "주차 정보"
}
```

---

### 데이터셋 현황 요약

| source_dataset          | category                      |     건수 | 좌표 제공   | 갱신 전략        |
| ----------------------- | ----------------------------- | -------: | ----------- | ---------------- |
| `TbVwRestaurants`       | 서울 관광 음식                |    1,246 | ❌ (주소만) | upsert           |
| `TbVwNature`            | 서울 관광 자연                |      148 | ❌          | upsert           |
| `TbVwAttractions`       | 서울 관광명소                 |      470 | ❌          | upsert           |
| `SearchParkInfoService` | 서울 주요 공원                |      133 | ✅ WGS84    | upsert           |
| `culturalSpaceInfo`     | 서울 문화공간                 |    1,051 | ✅ WGS84    | upsert (일 1회)  |
| `culturalEventInfo`     | 서울 문화행사                 |   ~3,904 | ✅ WGS84    | replace (일 1회) |
| `LOCALDATA_072405`      | 서울시 휴게음식점 인허가 정보 |  ~36,967 | ✅ 변환됨   | replace          |
| `LOCALDATA_072404`      | 서울시 일반음식점 인허가 정보 | ~120,649 | ✅ 변환됨   | replace          |
| `OA-13663`              | 서울시 식품위생업소 현황      |  ~10,018 | ❌ (주소만) | replace          |
| `viewNightSpot`         | 서울시 야경명소 정보          |       51 | ✅ WGS84    | upsert           |

---

## Sync 실행 방법

### 초기 전체 적재 (최초 1회)

```bash
npm run sync:public-data
```

- 모든 데이터셋을 순서대로 적재
- 휴게음식점 + 일반음식점 포함 시 약 15~20분 소요
- `public_data_sync_runs`에 `source = 'initial_public_data_sync'` 로 기록

### 일 1회 자동 갱신

서버 기동 시 내부 스케줄러가 매일 **04:10 KST** 에 자동 실행.

- 문화공간(`culturalSpaceInfo`) upsert
- 문화행사(`culturalEventInfo`) replace (종료 행사 삭제 + 신규 추가)
- `public_data_sync_runs`에 `source = 'daily_public_data_sync'` 로 기록

### 좌표 일괄 변환 (초기 적재 후 1회)

```bash
npm run convert:coordinates
```

- `LOCALDATA_072404`, `LOCALDATA_072405` 중 `latitude IS NULL` 인 레코드를 EPSG:5174 → WGS84 변환
- 1,000건 단위 배치 UPDATE (unnest 방식)

---

## 좌표계 변환

인허가 데이터(`LOCALDATA_072404`, `LOCALDATA_072405`)의 원본 `X`, `Y` 좌표는 **EPSG:5174** (한국 중부원점 TM) 기준.

| 항목            | 값                                              |
| --------------- | ----------------------------------------------- |
| 원본 좌표계     | EPSG:5174 (Korean 1985 / Modified Central Belt) |
| 타원체          | Bessel 1841                                     |
| 중앙경선        | 127°E                                           |
| 원점 위도       | 38°N                                            |
| 가산수치 (E/N)  | 200,000 m / 500,000 m                           |
| 변환 목표       | WGS84 (EPSG:4326)                               |
| 변환 라이브러리 | `proj4`                                         |
| Datum shift     | `-147, 506, 687` (Molodensky 3-param)           |

변환 로직: `src/utils/coordinates.ts` → `epsg5174ToWgs84(x, y)`

```
X ≈ 185,000 ~ 215,000  →  longitude ≈ 126.7° ~ 127.2°
Y ≈ 440,000 ~ 465,000  →  latitude  ≈ 37.4° ~ 37.7°
```

좌표 없는 레코드 (~14,000건): 원본 API에서 X/Y 미제공인 업소. `address` 컬럼에 도로명 주소가 있으므로 필요 시 지오코딩 후처리 가능.

---

## 마이그레이션

| 파일                                                           | 내용                                                |
| -------------------------------------------------------------- | --------------------------------------------------- |
| `db/migrations/20260506_initial_schema.sql`                    | 전체 초기 스키마 생성                               |
| `db/migrations/20260507_fix_public_data_unique_constraint.sql` | 유니크 제약 컬럼 수정 (`source` → `source_dataset`) |

적용 순서대로 실행:

```bash
psql -h <host> -U postgres -d seoulmate-db \
  -f db/migrations/20260506_initial_schema.sql \
  -f db/migrations/20260507_fix_public_data_unique_constraint.sql
```
