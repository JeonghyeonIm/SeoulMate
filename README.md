# SeoulMate

서울 내 데이트/외출 코스를 자연어 입력으로 AI가 추천해주는 서비스.

사용자가 "홍대에서 3만 원 이하로 조용한 데이트 코스 추천해줘"처럼 입력하면, 서울 공공데이터 기반 장소 후보를 LLM이 파싱하고 scoring해 실제 방문 가능한 코스를 반환한다.

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | PostgreSQL 16 (AWS RDS) |
| AI | OpenAI GPT-4.1-mini (structured output), LangGraph |
| 지도 | Kakao Local API, Kakao Mobility |
| 공공데이터 | 서울 열린데이터광장, 기상청 API |
| 배포 | AWS EC2 + Nginx + PM2 |

---

## 프로젝트 구조

```
SeoulMate/
└── SeoulMate_BE/          # 백엔드 (Express + TypeScript)
    ├── src/
    │   ├── graphs/        # LangGraph 추천 파이프라인
    │   ├── services/      # 비즈니스 로직
    │   ├── controllers/   # HTTP 핸들러
    │   ├── repositories/  # DB 접근
    │   ├── jobs/          # 배치 데이터 파이프라인
    │   └── clients/       # 외부 API 클라이언트
    └── docs/              # 설계 문서
```

---

## 빠른 시작

### 1. 의존성 설치

```bash
cd SeoulMate_BE
npm install
```

### 2. 환경변수 설정

```bash
cp .env.example .env
```

`.env` 필수 값:

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 연결 URL |
| `OPENAI_API_KEY` | OpenAI API 키 |
| `KAKAO_REST_API_KEY` | Kakao REST API 키 (지도 검색·검증) |
| `SEOUL_OPEN_API_KEY` | 서울 열린데이터광장 API 키 |
| `KMA_API_KEY` | 기상청 API 키 |
| `JWT_SECRET` | JWT 서명 키 |

OAuth 로그인을 사용하는 경우 `KAKAO_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`도 설정한다.

### 3. 개발 서버 실행

```bash
npm run dev
```

서버가 `http://localhost:3000`에서 실행된다. `GET /health`로 동작을 확인할 수 있다.

---

## 주요 스크립트

### 서버

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (ts-node-dev, hot reload) |
| `npm run build` | TypeScript 빌드 → `dist/` |
| `npm start` | 빌드 결과 실행 |

### 공공데이터 파이프라인

추천에 사용할 장소 데이터를 구축하는 배치 잡. 처음 설치 시 순서대로 실행한다.

```bash
# 1. 공공 API 원본 동기화
npm run sync:public-data

# 2. rule-based 카테고리 분류 (placeFamily, placeType)
npm run normalize:categories

# 3. 주소 → 좌표 보정 (좌표 없는 레코드)
npm run repair:coordinates

# 4. LOCALDATA 음식점·카페 Kakao 매칭
npm run normalize:kakao-categories

# 5. 비LOCALDATA 7개 데이터셋 Kakao URL 확보
npm run match:kakao-urls
```

### 실시간 데이터 동기화 (주기적 실행 권장)

```bash
npm run sync:weather            # 기상청 날씨 예보
npm run sync:living-population  # 서울 생활인구 통계
```

### 코드 품질

```bash
npm run lint        # ESLint 검사
npm run lint:fix    # ESLint 자동 수정
npm run format      # Prettier 포맷
```

---

## API 엔드포인트

Base URL: `http://localhost:3000/api`

| 카테고리 | 메서드 | 경로 | 인증 |
|---|---|---|---|
| Health | GET | `/health` | - |
| 회원가입 | POST | `/api/auth/signup` | - |
| 로그인 | POST | `/api/auth/login` | - |
| 토큰 재발급 | POST | `/api/auth/refresh` | - |
| 로그아웃 | POST | `/api/auth/logout` | - |
| Kakao OAuth | GET | `/api/auth/kakao` | - |
| Google OAuth | GET | `/api/auth/google` | - |
| 내 프로필 | GET | `/api/users/me` | Bearer |
| 선호 수정 | PATCH | `/api/users/me/preferences` | Bearer |
| **코스 추천** | **POST** | **`/api/courses/recommend`** | **Bearer** |
| 내 코스 목록 | GET | `/api/courses` | Bearer |
| 코스 상세 | GET | `/api/courses/{id}` | Bearer |
| 코스 저장 | POST | `/api/courses/{id}/save` | Bearer |
| 저장 코스 목록 | GET | `/api/courses/saved` | Bearer |
| 장소 검색 | GET | `/api/places/search` | Bearer |

전체 스펙: [`docs/API.md`](SeoulMate_BE/docs/API.md)

---

## 코스 추천 요청 예시

```http
POST /api/courses/recommend
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "오늘 저녁 성수에서 조용한 데이트 코스 추천해줘",
  "region": "성수",
  "vibes": ["조용한", "감성적인"],
  "budget": 40000,
  "duration": "gt-2h-lte-4h",
  "purpose": "데이트"
}
```

`query` 자연어만으로도 동작한다. 구조화 필드가 있으면 자연어 파싱값보다 우선 사용된다.

응답으로 최대 4개의 variant 코스(`best`, `indoor`, `mood-*` 등)를 반환한다.

---

## 추천 파이프라인

```
자연어 입력
  └─ parseUserRequest (LLM: 지역·예산·분위기·카테고리 추출)
       └─ fetchCandidatePlaces (공공데이터 DB 조회)
            └─ verifyCandidatePlaces (Kakao 장소 검증)
                 └─ fetchContextData (날씨·혼잡도 실시간 조회)
                      └─ scorePlaces (지역/예산/분위기/날씨 등 100점 scoring)
                           └─ buildCourseVariant × N (최대 4개 코스 빌드)
                                └─ generateAiExplanation (LLM: 코스 설명)
```

AI는 자연어 파싱과 설명 생성에만 관여한다. 장소 선택은 DB 후보 안에서만 이루어진다.

---

## 문서

| 파일 | 내용 |
|---|---|
| [`docs/API.md`](SeoulMate_BE/docs/API.md) | 전체 API 스펙 |
| [`docs/AI_COURSE_RECOMMENDATION.md`](SeoulMate_BE/docs/AI_COURSE_RECOMMENDATION.md) | 추천 시스템 설계 상세 |
| [`docs/DATABASE.md`](SeoulMate_BE/docs/DATABASE.md) | DB 스키마 및 테이블 설명 |
| [`docs/DEPLOYMENT.md`](SeoulMate_BE/docs/DEPLOYMENT.md) | AWS EC2/RDS 배포 가이드 |
| [`docs/ERROR_HANDLING.md`](SeoulMate_BE/docs/ERROR_HANDLING.md) | 에러 처리 흐름 |
| [`docs/PROJECT_STATUS.md`](SeoulMate_BE/docs/PROJECT_STATUS.md) | 구현 현황 및 남은 작업 |

---

## 로컬 개발 환경 요구사항

- Node.js 20+
- PostgreSQL 16+
- OpenAI API 키
- Kakao Developers 앱 (REST API 키)
- 서울 열린데이터광장 API 키
