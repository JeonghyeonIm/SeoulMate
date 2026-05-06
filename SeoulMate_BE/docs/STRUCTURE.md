# SeoulMate_BE Structure

## 개요

`SeoulMate_BE`는 TypeScript 기반 Express 백엔드입니다.
현재 구조는 `EC2`에서 백엔드 서버를 실행하고 `RDS PostgreSQL`에 연결하는 형태를 기준으로 정리되어 있습니다.

## 최상위 구조

```text
SeoulMate_BE/
|-- .env.example
|-- .gitignore
|-- .husky/
|-- db/
|   |-- migrations/
|   |   `-- 20260506_initial_schema.sql
|   `-- seed.sql
|-- docs/
|   |-- API.md
|   |-- AWS_SECURITY_GROUPS.md
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
|   |   `-- openai.ts
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
|-- tests/
`-- tsconfig.json
```

## 주요 설정 파일

### `.env.example`

- EC2/RDS 연결에 필요한 환경 변수 템플릿입니다.
- 핵심 변수:
  - `DATABASE_URL`
  - `DATABASE_SSL`
  - `POSTGRES_HOST`
  - `POSTGRES_PORT`
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`

### `package.json`

- Express 서버 실행, 빌드, 포맷, 린트 스크립트를 정의합니다.
- DB 라이브러리는 `pg`를 사용합니다.

## `db/`

### `migrations/20260506_initial_schema.sql`

- 초기 PostgreSQL 스키마 정의 파일입니다.
- `users`, `public_data`, `recommendation_requests`, `recommendations`, `saved_courses` 등을 생성합니다.

### `seed.sql`

- 개발용 샘플 장소 데이터를 적재합니다.

## `src/config/`

### `db.ts`

- `pg.Pool`을 생성합니다.
- `DATABASE_URL`이 있으면 그 값을 우선 사용하고, 없으면 개별 `POSTGRES_*` 환경 변수 조합으로 연결합니다.
- RDS SSL 연결은 `DATABASE_SSL`로 제어합니다.

### `env.ts`

- 환경 변수를 로드하고 기본값을 정리합니다.

## `src/models/`

### `user.model.ts`

- `users` 테이블 기준 사용자 타입을 정의합니다.

### `publicDataset.model.ts`

- `public_data` 테이블과 검색/업서트 입력 타입을 정의합니다.

### `recommendation.model.ts`

- `recommendation_requests`, `recommendations`, `saved_courses` 타입을 정의합니다.

### `score.model.ts`

- 추천 점수 계산 결과 구조를 정의합니다.

## `src/repositories/`

### `user.repository.ts`

- `users` 조회, 생성, 선호 정보 수정 로직을 담당합니다.

### `publicData.repository.ts`

- `public_data` 조회, 검색, 업서트 로직을 담당합니다.

### `recommendation.repository.ts`

- 추천 요청 생성
- 추천 결과 저장
- 저장 코스 등록/해제/조회

위 흐름의 DB 접근 로직을 담당합니다.

## 현재 계층 흐름

`routes -> controllers -> services -> repositories -> PostgreSQL`

## 문서

- `API.md`: 예정 API 명세 초안
- `AWS_SECURITY_GROUPS.md`: EC2/RDS 보안 그룹 생성 및 연결 절차
- `DB.md`: PostgreSQL 기반 DB 설계 문서
- `PUBLIC_DATA_APIS.md`: 서울 공공데이터 API 후보 및 수집 전략
- `STRUCTURE.md`: 현재 백엔드 구조 설명
