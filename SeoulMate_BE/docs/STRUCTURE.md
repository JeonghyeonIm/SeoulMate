# SeoulMate_BE Structure

## 개요

`SeoulMate_BE`는 TypeScript 기반 Express 백엔드 스캐폴드입니다.
현재 구조는 API 서버 기본 골격과 PostgreSQL/Supabase 연결 지점, 추천 도메인 확장을 위한 계층 구조를 포함합니다.

## 최상위 구조

```text
SeoulMate_BE/
|-- .env.example
|-- .gitignore
|-- .husky/
|-- docs/
|   |-- API.md
|   |-- DB.md
|   |-- PUBLIC_DATA_APIS.md
|   `-- STRUCTURE.md
|-- package.json
|-- scripts/
|   |-- seed.ts
|   |-- setupHusky.mjs
|   `-- syncPublicData.ts
|-- src/
|   |-- app.ts
|   |-- server.ts
|   |-- clients/
|   |-- config/
|   |   |-- db.ts
|   |   |-- env.ts
|   |   |-- openai.ts
|   |   `-- supabase.ts
|   |-- constants/
|   |-- controllers/
|   |-- middlewares/
|   |-- models/
|   |   |-- publicDataset.model.ts
|   |   |-- recommendation.model.ts
|   |   |-- score.model.ts
|   |   `-- user.model.ts
|   |-- repositories/
|   |   |-- publicData.repository.ts
|   |   |-- recommendation.repository.ts
|   |   `-- user.repository.ts
|   |-- routes/
|   |-- services/
|   |-- utils/
|   `-- validators/
|-- supabase/
|   |-- migrations/
|   |   `-- 20260506_initial_schema.sql
|   `-- seed.sql
|-- tests/
`-- tsconfig.json
```

## 주요 설정 파일

### `.env.example`

- 로컬 개발과 Supabase 연결에 필요한 환경 변수 템플릿입니다.
- 현재 핵심 변수:
  - `DATABASE_URL`
  - `DATABASE_SSL`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

### `package.json`

- Express 서버 실행, 빌드, 포맷, 린트 스크립트를 정의합니다.
- `pg`와 `@supabase/supabase-js`를 함께 사용합니다.

### `tsconfig.json`

- `src/**/*.ts`를 `dist/`로 컴파일합니다.
- strict TypeScript 설정을 사용합니다.

## `src/config/`

### `db.ts`

- `pg.Pool`을 생성합니다.
- `DATABASE_URL`이 있으면 Supabase Postgres에 직접 연결하고, 없으면 개별 Postgres 환경 변수 조합으로 연결합니다.
- SSL 여부는 `DATABASE_SSL`로 제어합니다.

### `env.ts`

- 환경 변수를 로드하고 기본값을 정리합니다.
- 포트와 boolean 값도 여기서 파싱합니다.

### `supabase.ts`

- `@supabase/supabase-js` 클라이언트를 생성합니다.
- 익명 키용 클라이언트와 서비스 롤 키용 관리자 클라이언트를 분리합니다.

## `src/models/`

### `user.model.ts`

- `profiles` 테이블 기준 사용자 프로필 타입을 정의합니다.

### `publicDataset.model.ts`

- `public_data` 테이블과 검색/업서트 입력 타입을 정의합니다.

### `recommendation.model.ts`

- `recommendation_requests`, `recommendations`, `saved_courses` 타입을 정의합니다.

### `score.model.ts`

- 추천 점수 계산 결과 구조를 정의합니다.

## `src/repositories/`

### `user.repository.ts`

- `profiles` 조회/업서트/선호 정보 수정 로직을 담당합니다.

### `publicData.repository.ts`

- `public_data` 조회, 검색, 업서트 로직을 담당합니다.

### `recommendation.repository.ts`

- 추천 요청 생성
- 추천 결과 저장
- 저장 코스 등록/해제/조회

위 흐름의 DB 접근 로직을 담당합니다.

## `supabase/`

### `migrations/20260506_initial_schema.sql`

- 초기 스키마 전체를 정의합니다.
- Auth 연동 트리거, RLS 정책, 인덱스, 앱 테이블 생성이 포함됩니다.

### `seed.sql`

- 개발용 샘플 장소 데이터를 적재합니다.

## `docs/`

- `API.md`: 예정 API 명세 초안
- `DB.md`: Supabase 기반 DB 설계 문서
- `PUBLIC_DATA_APIS.md`: 서울 공공데이터 API 후보 및 수집 전략 문서
- `STRUCTURE.md`: 현재 백엔드 구조 설명

## 현재 계층 흐름

권장 흐름은 아래와 같습니다.

`routes -> controllers -> services -> repositories -> PostgreSQL/Supabase`

현재 repository 계층까지는 기본 구현이 들어갔고, 컨트롤러/서비스 계층은 이 스키마를 기준으로 이어서 구현할 수 있는 상태입니다.

## 다음 구현 포인트

1. Supabase Auth 기반 로그인/회원가입 API 연결
2. `profiles` 기반 `/users/me` 구현
3. `public_data` 검색 API 구현
4. `recommendation_requests`, `recommendations` 기반 추천 저장 API 구현
5. `saved_courses` 기반 저장 코스 API 구현
