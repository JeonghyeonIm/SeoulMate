==== 정현아 꼭 읽어봐. 혁준이 형아가 ====
refresh token 무효화나 토큰 보안 쪽은 지금 당장 신경 안 써도 될 것 같아.

어차피 카카오/구글 OAuth 붙이면 토큰 관련 로직 다시 짜야 하거든. 지금 로컬 로그인 기준으로 먼저 구현하면 나중에 이중 작업 돼.

그래서 순서를 이렇게 가져가면 어떨까 싶어.

지금은 토큰 쪽 신경 끄고 다른 기능 구현 → OAuth 포함 회원가입 로직 완성 → 그때 refresh token 저장/무효화 같이 처리

어떻게 생각해?

## 수정 1. 중기예보 DB 조회로 변경

**수정 전**

- `getMediumTermForecast()`가 `weather_forecasts` 테이블을 무시하고 KMA API를 직접 호출
- DB에 데이터가 있어도 항상 `NO_DATA`가 발생할 수 있었음

**수정 후**

- `weather_forecasts` DB를 먼저 조회하고, 데이터가 없을 때만 KMA API fallback 하도록 변경
- 실제 DB 조회 및 날짜 매칭 성공까지 확인 완료

---

## 수정 2. 추천 API 응답에 날씨 정보 추가

**수정 전**

- LangGraph 내부에서 `context.weather`는 생성되지만 최종 응답 JSON에는 누락됨

**수정 후**

- 추천 응답에 `weather` 필드가 정상 포함되도록 반영
- `source`, `rainProbability`, `skyStatus`, `temperature`, `weatherAlert`를 함께 전달

---

## 기타 작업

- `@langchain/langgraph` 패키지 설치
- `pino` 로거 세팅 및 `ts-node-dev` 환경 호환 방식으로 출력 경로 정리
- 추천 요청 body의 `dateTime` 필드를 LangGraph state까지 전달하도록 수정
- `fetchContextData` 노드에 날씨 분기 디버그 로그 추가

---

# SeoulMate 백엔드 구현 현황 정리

## 1. 초기 대비 구현된 것

| 영역                | 초기 상태                            | 지금 상태                                                                                                |
| ------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| LangGraph 추천 흐름 | 없음/미연결 수준                     | `parse → 후보조회 → 지도검증 → 실시간/날씨 → 스코어링 → 코스구성 → 검증 → AI설명 → 결과정리` 그래프 구현 |
| 코스 추천 요청      | 문자열 `input` 중심                  | 명세처럼 JSON 요청 지원: `vibes`, `region`, `budget`, `duration`, `purpose`, `query`                     |
| 코스 추천 응답      | 내부 state/result 형태               | 명세처럼 `{ courses: [...] }` 반환                                                                       |
| 코스 상세 조회      | 미흡/내부 DB 형태                    | `id`, `title`, `description`, `totalCost`, `duration`, `congestion`, `places[]` 형태 구현                |
| 장소 검색/상세      | `public_data` 원본 반환 위주         | `/places/search`, `/places/:id` 명세 응답 형태 구현                                                      |
| 인증                | 부분 구현                            | `signup/login/refresh/logout` + JWT access/refresh 동작                                                  |
| 유저 API            | 부분 구현                            | `/users/me`, `/users`, `/users/:id`, `/users/me/preferences` 명세형 응답 구현                            |
| 코스 저장           | 부분 구현                            | 저장, 저장취소, 저장목록 구현                                                                            |
| ID 형식             | 숫자 ID                              | 응답은 `crs_45`, `plc_290538` 형태. 요청은 prefix/숫자 둘 다 파싱                                        |
| 날씨 분기           | 불명확/한꺼번에 호출 위험            | 실시간 `citydata`, 초단기, 단기, 중기, 11일 이후 `unavailable` 분기                                      |
| 지도/거리           | fallback 위주                        | Kakao walking route 연결 + fallback. Kakao Local 후보 검증 노드 추가                                     |
| 후보 품질           | 지역명 title 매칭으로 이상 후보 섞임 | 서울 지역 alias/구 단위 필터, 좌표 있는 장소 우선, 지도 검증 우선 반영                                   |
| 테스트              | 없음                                 | build/lint 통과, 실제 HTTP 20개 추천 + 상세 조회 전부 PASS                                               |

## 2. 명세 기준 구현 완료된 API

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /users/me`
- `PATCH /users/me/preferences`
- `GET /users`
- `GET /users/:userId`
- `POST /courses/recommend`
- `GET /courses/:courseId`
- `POST /courses/:courseId/save`
- `DELETE /courses/:courseId/save`
- `GET /courses/saved`
- `GET /places/search`
- `GET /places/:placeId`

## 3. 아직 구현 안 됐거나 제한 있는 것

| 항목                         | 상태                      | 이유                                                          |
| ---------------------------- | ------------------------- | ------------------------------------------------------------- |
| 관리자 권한 403              | 미구현                    | DB에 `role`, `is_admin` 같은 컬럼 없음                        |
| refreshToken 실제 무효화     | 미구현                    | refresh token 저장/블랙리스트 테이블 없음. 현재는 검증 후 204 |
| 예산 선호 저장               | 미구현                    | `users` 테이블에 budget 컬럼 없음                             |
| 미래 혼잡도 분석             | 미구현                    | 상권분석서비스 데이터셋이 현재 DB에 없음                      |
| Kakao 별점/후기 수 기반 정렬 | 불가/미구현               | Kakao Local 공식 응답에 별점/리뷰 수 없음                     |
| Kakao Local 후보 검증        | 코드 구현, 실제 호출 실패 | 현재 REST Local API 호출이 403. 키 권한 확인 필요             |
| STT 음성 입력                | 미구현                    | 현재는 텍스트/query 기준                                      |
| 코스 여러 개 추천            | 현재 1개                  | 명세는 `courses[]`지만 지금은 추천 코스 1개 반환              |
| 추천 결과 완전 보존          | 부분 구현                 | 상세 조회 시 title/duration 일부 재계산됨                     |
| 운영시간 정확도              | 부분 구현                 | metadata 기반 추정, 없으면 “방문 전 확인 필요”                |
| 가격 정확도                  | 부분 구현                 | 공공데이터 fee가 있으면 사용, 없으면 카테고리 추정            |

## 4. 추가 보완하면 좋은 것

### 4.1 추천 결과 완전 보존

코스 상세 조회에서 추천 당시의 `title`, `duration`, `congestion`, `description`을 그대로 저장하고 조회하도록 보완이 필요하다.

현재는 추천 응답과 상세 응답의 형식은 맞지만, 상세 조회 시 `title`과 `duration`이 일부 재계산되어 추천 직후 응답과 약간 달라질 수 있다.

### 4.2 Kakao Local API 403 해결

`KAKAO_REST_API_KEY`가 진짜 REST API 키인지, Kakao Developers에서 Local API 사용 권한이 열려 있는지 확인이 필요하다.

현재 코드는 Kakao Local 후보 검증 노드를 포함하고 있지만, 실제 호출이 403으로 실패하여 fallback으로 DB 후보를 사용한다.

### 4.3 듣보잡 방지 강화

Kakao Local 검증이 정상화되면 검증 실패 장소를 제외하거나, 상설 장소 우선/행사성 장소 제한을 더 강하게 적용할 수 있다.

이를 통해 지도에서 조회되지 않거나 실제 방문지로 부적합한 후보가 추천되는 문제를 줄일 수 있다.

### 4.4 추천 코스 2~3개 반환

현재는 `courses` 배열 형태로 응답하지만 실제 추천 코스는 1개만 반환한다.

프론트에서 선택지를 보여주려면 다음과 같은 방식으로 여러 코스를 생성할 수 있다.

- `best`: 기본 최적 코스
- `indoorAlternative`: 실내 중심 대체 코스
- `lowBudget`: 저예산 중심 코스

### 4.5 DB 스키마 확장 논의

아래 기능은 DB 변경이 필요하다.

- 관리자 권한
- refresh token 무효화
- 예산 선호 저장
- 상권 혼잡도 저장/분석
- 추천 snapshot 저장

### 4.6 장기 테스트

현재 지역 20개 추천 요청과 코스 상세 조회는 통과했다.

추가로 아래 케이스에 대한 테스트가 필요하다.

- 예산 극단값
- 서울 외 지역
- 후보 부족 지역
- 11일 이후 날짜
- 비 오는 날
- 야간 요청
- 매우 짧은 코스 요청
- 긴 코스 요청
- 카페/공원/전시 등 특정 카테고리 중심 요청

---

# 2차 작업 — DB 스키마 확장 및 누락 모듈 설치

## 수정 1. 누락 패키지 설치

**수정 전**

- `@langchain/langgraph`, `pino`, `pino-http`, `pino-pretty`가 `package.json`에 명시됐지만 `node_modules`에 미설치
- `tsc --noEmit` 시 모듈 미인식 오류 다수 발생

**수정 후**

- `npm install`로 전체 패키지 설치 완료
- `tsc --noEmit` 및 `npm run build` 오류 0개

---

## 수정 2. users 테이블 스키마 확장

**수정 전**

- `vibes`가 `preferred_category` 컬럼에 CSV 문자열(`"조용한,힙한"`)로 저장되는 임시처방
- `preference.repository.ts`가 `inMemoryDatabase`를 사용해 서버 재시작 시 데이터 유실
- `budget`, `role` 컬럼 없음

**수정 후**

- `users.vibes text[] DEFAULT '{}'` 컬럼 추가
- `users.budget integer` 컬럼 추가
- `users.role varchar(20) DEFAULT 'user'` 컬럼 추가 (체크 제약: `'user'`, `'admin'`)
- 기존 `preferred_category` CSV 데이터를 `string_to_array`로 `vibes` 배열에 마이그레이션
- `auth.service.ts`의 `preferredCategory: vibes.join(",")` 임시처방 제거 → `vibes` 컬럼에 직접 저장
- `inMemoryDatabase` 의존 제거

---

## 수정 3. 추천 결과 Snapshot 저장

**수정 전**

- `recommendation_requests`에 코스 정보(제목, 소요시간, 혼잡도, 설명, 예산)가 저장되지 않음
- `GET /courses/:id` 조회 시 title·duration·congestion이 DB 아이템에서 재계산됨 → 추천 당시 응답과 불일치

**수정 후**

- `recommendation_requests`에 컬럼 5개 추가
  - `course_title`, `course_duration_minutes`, `course_congestion`, `course_description`, `course_estimated_budget`
- 추천 그래프 실행 직후 snapshot을 `createRequest` 시점에 함께 저장
- `GET /courses/:id` 조회 시 snapshot 컬럼 우선 사용, 없을 경우 기존 재계산 방식 fallback

---

## 수정 4. API 응답 변경사항

### PATCH /users/me/preferences

**수정 전 응답**
```json
{ "vibes": ["조용한"], "updatedAt": "..." }
```

**수정 후 응답**
```json
{ "vibes": ["조용한"], "budget": 50000, "updatedAt": "..." }
```

### GET /users/me, GET /users/:id, GET /users

**수정 전 응답**
```json
{ "id": "1", "email": "...", "nickname": "...", "vibes": ["조용한"], "createdAt": "..." }
```

**수정 후 응답**
```json
{ "id": "1", "email": "...", "nickname": "...", "vibes": ["조용한"], "budget": 50000, "role": "user", "createdAt": "..." }
```

---

## 변경 파일 목록

| 파일 | 변경 내용 |
| ---- | --------- |
| `db/migrations/20260508_users_schema_and_course_snapshot.sql` | 신규 마이그레이션 |
| `src/models/user.model.ts` | `vibes`, `budget`, `role` 필드 추가 |
| `src/models/recommendation.model.ts` | snapshot 필드 5개 추가 |
| `src/repositories/user.repository.ts` | 쿼리 전면 수정, inMemory 제거 |
| `src/repositories/recommendation.repository.ts` | `createRequest` snapshot 컬럼 포함 |
| `src/services/auth.service.ts` | vibes 임시처방 제거 |
| `src/services/user.service.ts` | `UpdatePreferencesInput`에 `vibes`, `budget` 추가 |
| `src/services/recommendation.service.ts` | snapshot 저장 + 조회 시 우선 사용 |
| `src/controllers/user.controller.ts` | 응답에 `budget`, `role` 포함, `readPositiveBudget` 추가 |

## 적용 방법

마이그레이션 파일을 DB에 수동 적용 필요:

```sql
\i db/migrations/20260508_users_schema_and_course_snapshot.sql
```

---

# 3차 작업 — 이메일/카카오/구글 인증 전면 구현

## 수정 1. users 테이블 OAuth 컬럼 추가

**마이그레이션 파일: `db/migrations/20260508_users_add_oauth.sql`**

- `provider varchar(20) NOT NULL DEFAULT 'local'` 컬럼 추가 (체크 제약: `'local'`, `'kakao'`, `'google'`)
- `oauth_id varchar(255)` 컬럼 추가
- `password_hash` NOT NULL 제약 제거 → OAuth 유저는 null 허용
- `(provider, oauth_id) WHERE oauth_id IS NOT NULL` 부분 유니크 인덱스 생성

```sql
\i db/migrations/20260508_users_add_oauth.sql
```

---

## 수정 2. 이메일 회원가입·로그인 버그 수정

**수정 전**

- `signup` 응답에 `accessToken`, `refreshToken`이 누락됨 (user 객체만 반환)
- `login` 응답에 `tokenType`, `expiresIn` 누락
- `refresh` 응답에 새 `refreshToken`이 없어 토큰 로테이션 불가
- `login`이 OAuth 유저(`passwordHash = null`)에게 bcrypt 비교를 시도해 오류 발생

**수정 후**

- `signup` → 201 + 전체 `AuthResponseBody` (`user`, `accessToken`, `refreshToken`, `tokenType`, `expiresIn`)
- `login` → 200 + 전체 `AuthResponseBody` 동일 구조
- `refresh` → 200 + 새 `refreshToken` 포함 전체 `AuthResponseBody`
- `login` 진입 시 `user.provider !== 'local'`이면 401 반환 (bcrypt 시도 전 차단)

---

## 수정 3. 카카오 OAuth 구현

**수정 전**: 라우터/컨트롤러에 관련 코드 없음

**수정 후**

- `GET /api/auth/kakao` → 카카오 인가 URL로 리다이렉트
- `GET /api/auth/kakao/callback` → 인가 코드 수신 → access token 교환 → 사용자 정보 조회 → 자동 회원가입/로그인 → 프론트로 리다이렉트
  - 리다이렉트: `{FRONTEND_URL}/auth/callback?accessToken=...&refreshToken=...`
- 신규 파일: `src/clients/kakao.oauth.client.ts`
  - `getAuthorizationUrl()`, `getAccessToken(code)`, `getUserInfo(accessToken)` 구현

---

## 수정 4. 구글 OAuth 구현

**수정 전**: 라우터/컨트롤러에 관련 코드 없음

**수정 후**

- `GET /api/auth/google` → 구글 인가 URL로 리다이렉트 (scope: openid email profile)
- `GET /api/auth/google/callback` → 동일 플로우, 프론트로 리다이렉트
- 신규 파일: `src/clients/google.oauth.client.ts`
  - `getAuthorizationUrl()`, `getAccessToken(code)`, `getUserInfo(accessToken)` 구현

---

## 수정 5. OAuth 공통 로직 (자동 회원가입)

OAuth 콜백 공통 처리 흐름 (`loginWithOAuth` 함수):

1. `(provider, oauth_id)`로 기존 유저 조회 → 있으면 즉시 토큰 발급
2. 이메일로 조회 → 다른 provider로 가입된 계정이면 409 반환
3. 신규 유저면 자동 회원가입 (닉네임 중복 시 `이름_xxxx` → `user_xxxxxx` 순으로 대체)

---

## 수정 6. 환경변수 추가

`src/config/env.ts`에 추가된 항목:

| 변수 | 기본값 |
| ---- | ------ |
| `KAKAO_CLIENT_SECRET` | `""` |
| `KAKAO_REDIRECT_URI` | `http://localhost:3000/api/auth/kakao/callback` |
| `GOOGLE_CLIENT_ID` | `""` |
| `GOOGLE_CLIENT_SECRET` | `""` |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/api/auth/google/callback` |
| `FRONTEND_URL` | `http://localhost:3001` |

**`.env`에 실제 값 설정 필요** (배포 전 필수):

```
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
KAKAO_REDIRECT_URI=https://{백엔드 도메인}/api/auth/kakao/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://{백엔드 도메인}/api/auth/google/callback
FRONTEND_URL=https://{프론트엔드 도메인}
JWT_SECRET=          # 프로덕션용 랜덤 시크릿 필수
```

**개발자 콘솔 등록 필요:**
- Kakao Developers → 앱 → 카카오 로그인 → Redirect URI 등록
- Google Cloud Console → OAuth 2.0 → 승인된 리다이렉션 URI 등록

---

## 변경 파일 목록

| 파일 | 변경 내용 |
| ---- | --------- |
| `db/migrations/20260508_users_add_oauth.sql` | 신규 마이그레이션 |
| `src/clients/kakao.oauth.client.ts` | 신규 — 카카오 OAuth 클라이언트 |
| `src/clients/google.oauth.client.ts` | 신규 — 구글 OAuth 클라이언트 |
| `src/models/user.model.ts` | `provider`, `oauthId`, `passwordHash nullable` 반영 |
| `src/repositories/user.repository.ts` | `findByOAuth`, `findAvailableNickname` 추가 |
| `src/types/auth.types.ts` | `provider` 필드 제거, `password` 필수화 |
| `src/validators/user.validator.ts` | provider 검증 제거 |
| `src/services/auth.service.ts` | 이메일/카카오/구글 전체 플로우 재작성 |
| `src/controllers/auth.controller.ts` | OAuth 컨트롤러 추가, 응답 body 전면 수정 |
| `src/routes/auth.routes.ts` | `/kakao`, `/kakao/callback`, `/google`, `/google/callback` 라우트 추가 |
| `src/config/env.ts` | OAuth 관련 환경변수 6개 추가 |
