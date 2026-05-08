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
| 관리자 권한 403              | 부분 구현                 | `role` 컬럼 추가됨 (2차 작업). API 레벨 403 강제 미적용       |
| refreshToken 실제 무효화     | 구현 완료                 | `refresh_token_blacklist` 테이블 + SHA-256 해시 저장. logout 시 등록, refresh 시 체크 (6차 작업) |
| 예산 선호 저장               | 구현 완료                 | `users.budget` 컬럼 추가 및 저장 완료 (2차 작업)              |
| 미래 혼잡도 분석             | 구현 완료                 | `living_population_stats` 테이블 적재 완료 (5차 작업)         |
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

---

# 4차 작업 — 로컬 인증 테스트 완료 및 프로덕션 배포 가이드

## 테스트 결과 (localhost:3000)

| 인증 방식 | 결과 | 비고 |
| --------- | ---- | ---- |
| 이메일 회원가입 (`POST /api/auth/signup`) | 성공 | DB에 유저 생성 확인 |
| 이메일 로그인 (`POST /api/auth/login`) | 성공 | accessToken/refreshToken 정상 발급 |
| 구글 OAuth | 성공 | 자동 회원가입 + 토큰 발급 확인 |
| 카카오 OAuth | 성공 | 자동 회원가입 + 토큰 발급 확인 |

---

## OAuth 흐름 정리 (프론트 연동 기준)

### 이메일 로그인 — 일반 fetch/axios 호출

```typescript
const res = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
})
const { accessToken, refreshToken } = await res.json()
```

### 카카오/구글 OAuth — 브라우저 페이지 이동

```typescript
// fetch가 아닌 브라우저 이동으로 시작
window.location.href = 'https://api.seoulmate.my/api/auth/kakao'
window.location.href = 'https://api.seoulmate.my/api/auth/google'
```

**전체 흐름:**

1. 프론트에서 `window.location.href`로 백엔드 OAuth 시작 엔드포인트 이동
2. 백엔드 → 카카오/구글 로그인 페이지로 302 리다이렉트
3. 사용자 로그인 완료
4. 카카오/구글 → 백엔드 콜백 URL(`/api/auth/kakao/callback`)로 인가 코드 전달
5. 백엔드에서 인가 코드로 access token 교환 → 사용자 정보 조회 → 자동 회원가입/로그인
6. 백엔드 → 프론트 `{FRONTEND_URL}/auth/callback?accessToken=...&refreshToken=...` 로 리다이렉트
7. 프론트에서 URL 파라미터에서 토큰 꺼내 저장

---

## 카카오 개발자 콘솔 설정 주의사항

| 항목 | 설정 |
| ---- | ---- |
| 플랫폼 → Web → 사이트 도메인 | `http://localhost:3000` (개발), `https://api.seoulmate.my` (운영) |
| 카카오 로그인 활성화 | ON |
| Redirect URI | `http://localhost:3000/api/auth/kakao/callback` (개발), `https://api.seoulmate.my/api/auth/kakao/callback` (운영) |
| 동의항목 → 닉네임 | 필수 동의 |
| 동의항목 → 이메일 | 필수 동의 (없으면 로그인 실패) |
| 보안 → Client Secret | 사용 시 `.env`의 `KAKAO_CLIENT_SECRET`에 실제 값 필요 |
| 앱 설정 → 보안 → 서비스 앱 IP 허용 | 사용 안 함 권장 (개발 중 IP 고정 불가) |
| 앱 설정 → 팀 관리 | 개발 단계에서는 테스트 계정을 팀원으로 등록해야 함 |

---

## EC2 프로덕션 배포 절차 (`api.seoulmate.my` → 13.209.103.176)

### 1. 기본 패키지 설치

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Nginx 설정

```nginx
# /etc/nginx/sites-available/api.seoulmate.my
server {
    listen 80;
    server_name api.seoulmate.my;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/api.seoulmate.my /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3. HTTPS 인증서

```bash
sudo certbot --nginx -d api.seoulmate.my
```

### 4. 코드 배포 및 실행

```bash
git clone {레포 주소}
cd SeoulMate_BE
npm install
npm run build
pm2 start dist/server.js --name "seoulmate-be"
pm2 save && pm2 startup
```

### 5. AWS EC2 보안 그룹 인바운드 규칙 필수

| 유형 | 포트 | 소스 |
| ---- | ---- | ---- |
| HTTP | 80 | 0.0.0.0/0 |
| HTTPS | 443 | 0.0.0.0/0 |

---

## 프로덕션 `.env` 설정

```env
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://www.seoulmate.my
KAKAO_REDIRECT_URI=https://api.seoulmate.my/api/auth/kakao/callback
GOOGLE_REDIRECT_URI=https://api.seoulmate.my/api/auth/google/callback
JWT_SECRET=<충분히 긴 랜덤 문자열>
```

배포 후 카카오/구글 콘솔에 운영용 Redirect URI 추가 필요.

---

# 5차 작업 — 서울 생활인구 데이터 적재 (OA-14991)

## 배경

3섹션 상태 테이블에서 "미구현"으로 남아 있던 **미래 혼잡도 분석** 항목을 해결했다.

원래 검토한 OA-15568 (상권분석서비스 길단위인구)은 서비스 종료 상태였고 API 서비스명도 공개되지 않아 사용 불가. 대신 **OA-14991 (행정동 단위 서울 생활인구)** 로 구현했다:

- 매일 업데이트 (전날 기준 5일 전 데이터 반영)
- 파일 형태: `LOCAL_PEOPLE_DONG_YYYYMM.zip` (월별 ZIP + 내부 CSV)
- 집계 방식: 최근 3개월 데이터 → 요일 × 시간대 평균 → `living_population_stats` 적재

---

## 신규 DB 테이블 — `living_population_stats`

| 컬럼 | 타입 | 설명 |
| ---- | ---- | ---- |
| `dong_code` | varchar(10) | 행정동코드 (8자리) |
| `day_of_week` | smallint | 요일 1(월)~7(일) |
| `hour_code` | smallint | 시간대 0~23 |
| `avg_population` | integer | 최근 N개월 평균 유동인구 (추정치 반올림) |
| `sample_months` | smallint | 집계에 사용된 월 수 |

- UNIQUE (dong_code, day_of_week, hour_code)
- 초기 적재 결과: 3개월 905,664행 파싱 → **71,232건 upsert** (424개 행정동 × 7요일 × 24시간)

마이그레이션:

```sql
\i db/migrations/20260508_add_living_population_stats.sql
```

---

## 수정 1. seoulOpenData.client.ts 확장

**수정 전**

- `parseCsv` 함수가 private이라 외부에서 재사용 불가
- 생활인구 ZIP 다운로드 관련 코드 없음

**수정 후**

- `parseCsv` 함수 export 추가
- `FOOD_HYGIENE_DOWNLOAD_URL` → `SEOUL_DATA_FILE_DOWNLOAD_URL` 리네임 (공통 다운로드 엔드포인트)
- `LIVING_POPULATION_LIST_URL` 상수 추가
- `LivingPopulationFileInfo` 인터페이스 추가
- `fetchLivingPopulationFileList()` — 데이터 포털 페이지를 스크래핑해 ZIP 파일 목록(seq, fileName, yyyymm) 반환
- `fetchLivingPopulationZip(seq)` — 파일 seq로 ZIP 다운로드 후 Buffer 반환

**구현 중 발견된 주의사항:**

- 파일명이 `<a>` 태그 텍스트가 아닌 **title 속성**에 있음 → regex: `downloadFile\('(\d+)'\)[^>]*title="(LOCAL_PEOPLE_DONG_(\d{6})\.zip)"`
- 다운로드 POST 파라미터: `infId=OA-14991`, `seq=XXXX`, **`infSeq=3`** (1·2는 "잘못된 접근" 오류 응답)

---

## 수정 2. livingPopulation.service.ts 신규

- ZIP Buffer → `unzipper.Open.buffer()` → 내부 CSV 추출
- CSV 인코딩: EUC-KR 디코딩 시도 → fallback UTF-8
- **헤더 이름 기반 파싱 불가**: EUC-KR 헤더가 런타임에서 깨짐 → **위치(인덱스) 기반 파싱** 적용
  - `[0]` 기준일ID (YYYYMMDD), `[1]` 시간대(0-23), `[2]` 행정동코드(8자리), `[3]` 총생활인구수(float 추정값)
- 집계 알고리즘: `Map<dongCode, Map<dayOfWeek, Map<hourCode, {sum, count}>>>` → 평균 계산
- `syncLivingPopulationData(monthsToProcess = 3)` 함수

---

## 수정 3. 기타 신규 파일

- `src/repositories/livingPopulation.repository.ts` — `upsertMany`, `findByDongCodes`, `findAvgByGuCode`
- `src/jobs/runLivingPopulationSync.ts` — 독립 실행 job. 환경변수 `LIVING_POP_MONTHS`로 처리 개월 수 조정 가능
- `src/constants/datasetType.ts` — `LIVING_POPULATION: "서울시 생활인구 통계"` 추가
- `package.json` — `unzipper` 의존성 추가, `sync:living-population` 스크립트 추가

---

## 적용 방법

```bash
# 1. 마이그레이션 적용 (DB에 living_population_stats 테이블 생성)
# psql 또는 DB 클라이언트에서 실행:
# \i db/migrations/20260508_add_living_population_stats.sql

# 2. 데이터 동기화 (최근 3개월 기본)
npm run sync:living-population

# 개월 수 지정 시
LIVING_POP_MONTHS=6 npm run sync:living-population
```

---

## 추천 엔진 활용 방법

```typescript
import { livingPopulationRepository } from "../repositories/livingPopulation.repository";

// 미래 날짜의 구 코드 + 요일 + 시간대로 평균 유동인구 조회
const guCode = dongCode.slice(0, 5);          // 예: '11650' (강남구)
const dayOfWeek = targetDate.getDay() || 7;   // 1(월)~7(일)
const hourCode = targetDate.getHours();        // 0-23

const avgPop = await livingPopulationRepository.findAvgByGuCode(guCode, dayOfWeek, hourCode);
// avgPop 값을 임계값과 비교해 LOW / MEDIUM / HIGH 혼잡도 분류에 활용
```

---

## 변경 파일 목록

| 파일 | 변경 내용 |
| ---- | --------- |
| `db/migrations/20260508_add_living_population_stats.sql` | 신규 마이그레이션 |
| `src/clients/seoulOpenData.client.ts` | parseCsv export, 다운로드 URL 리네임, ZIP 다운로드 메서드 2개 추가 |
| `src/repositories/livingPopulation.repository.ts` | 신규 |
| `src/services/livingPopulation.service.ts` | 신규 |
| `src/jobs/runLivingPopulationSync.ts` | 신규 |
| `src/constants/datasetType.ts` | LIVING_POPULATION 상수 추가 |
| `package.json` | unzipper 의존성 추가, sync:living-population 스크립트 추가 |

---

# 6차 작업 — Refresh Token 블랙리스트 구현

## 배경

OAuth(카카오/구글) 구현 완료 후 토큰 무효화 지연 이유가 해소됨. `POST /api/auth/logout`이 이전까지는 token 검증만 하고 204를 반환했으며, 로그아웃 후에도 동일 refresh token으로 재발급 가능한 보안 취약점 존재.

## 구현 내용

### DB 마이그레이션

`db/migrations/20260508_add_refresh_token_blacklist.sql`

- `refresh_token_blacklist` 테이블 생성
  - `token_hash VARCHAR(64)` — SHA-256(refresh token) hex, UNIQUE
  - `user_id INTEGER` — `users.id` FK (CASCADE DELETE)
  - `expires_at TIMESTAMPTZ` — 토큰 만료 시점 (원본 `exp` 클레임 기준)
- 인덱스: `token_hash` (lookup), `expires_at` (cleanup)

### 흐름

1. **로그아웃** (`POST /api/auth/logout`): `verifyToken` → SHA-256 해시 → `refresh_token_blacklist` INSERT
2. **토큰 갱신** (`POST /api/auth/refresh`): `verifyToken` 통과 후 해시 블랙리스트 체크 → 등록된 경우 401 반환
3. **만료 토큰 정리**: 서버 시작 시 `scheduleTokenBlacklistCleanup()` 등록 → 1시간 간격 `DELETE WHERE expires_at <= now()`

### 변경 파일

| 파일 | 변경 내용 |
| ---- | --------- |
| `db/migrations/20260508_add_refresh_token_blacklist.sql` | 신규 마이그레이션 |
| `src/utils/jwt.ts` | `hashToken(token): string` export 추가 (SHA-256 hex) |
| `src/repositories/tokenBlacklist.repository.ts` | 신규 — `add`, `isBlacklisted`, `deleteExpired` |
| `src/services/auth.service.ts` | `logout()` 신규, `refreshAuth()` 블랙리스트 체크 추가, `scheduleTokenBlacklistCleanup()` 신규 |
| `src/controllers/auth.controller.ts` | `logoutController` → `logout()` 서비스 위임으로 변경, `verifyToken` 직접 호출 제거 |
| `src/server.ts` | `scheduleTokenBlacklistCleanup()` 등록 |

---

# 7차 작업 — 에러 응답 한글화, dateTime 우선순위/검증, timeout warnings, 생활인구 혼잡도 반영

## 수정 1. 전체 에러 응답 형태 통일 및 한글화

**수정 전**

- `ApiError` 응답이 `{ "message": "..." }` 형태로만 내려감
- 일부 인증/추천/유저/장소 에러 메시지가 영어로 반환됨
- 처리되지 않은 일반 Error 메시지가 그대로 응답되어 영어 내부 오류가 노출될 수 있었음

**수정 후**

- 처리된 에러 응답을 아래 형태로 통일

```json
{
  "status": 400,
  "message": "한글 오류 사유"
}
```

- 일반 500 오류는 내부 영어 메시지를 노출하지 않고 `"서버 오류가 발생했습니다."`로 통일

### 변경된 에러 케이스 목록

| 케이스 | 변경 후 메시지 |
| ---- | ---- |
| 인증 토큰 누락 | `인증 토큰이 필요합니다.` |
| 인증 사용자 없음 | `인증된 사용자를 찾을 수 없습니다.` |
| 유효하지 않은 access token | `유효하지 않은 토큰입니다.` |
| 로그인 필요 | `로그인이 필요합니다.` |
| 사용자 없음 | `사용자를 찾을 수 없습니다.` |
| 장소 없음 | `장소를 찾을 수 없습니다.` |
| 코스 없음 | `코스를 찾을 수 없습니다.` |
| 이미 저장된 코스 | `이미 저장된 코스입니다.` |
| 저장 코스 없음 | `저장된 코스를 찾을 수 없습니다.` |
| `courseId`, `placeId`, `userId` 형식 오류 | `... 값은 양의 정수여야 합니다.` |
| `region` 누락 | `region 값은 필수입니다.` |
| `vibes` 누락/형식 오류 | `vibes 값은 필수입니다.`, `vibes 값은 문자열 배열이어야 합니다.` |
| `budget` 형식 오류 | `budget 값은 양수여야 합니다.` |
| `duration` 형식 오류 | `duration 값은 2h, half-day, full-day 중 하나여야 합니다.` |
| 유저 선호값 형식 오류 | `vibes와 regions는 문자열 배열이어야 합니다.` |
| 유저 선호 수정값 누락 | `vibes, regions, budget 중 하나 이상이 필요합니다.` |
| JSON/body parser 400 | `요청 형식이 올바르지 않습니다.` |

**커밋명 추천**

`fix: 에러 응답 한글화 및 형식 통일`

---

## 수정 2. parseUserRequestNode dateTime 우선순위 고정

**수정 전**

- request body의 `dateTime`이 state에 있어도 query 안의 `"오늘"`, `"내일"` 같은 상대 시간 표현을 휴리스틱 파싱한 값이 다시 덮어쓸 수 있었음

**수정 후**

- 우선순위를 아래처럼 고정
  1. request body의 `dateTime`
  2. query에서 AI/휴리스틱으로 파싱한 시간 표현
  3. 둘 다 없으면 서버 현재 시각
- 레거시 `{ "input": "..." }` 요청에서도 body에 `dateTime`이 있으면 검증 후 그래프 state에 전달

**커밋명 추천**

`fix: 요청 dateTime 우선순위 고정`

---

## 수정 3. dateTime 범위 검증 추가

**수정 전**

- request body의 `dateTime`이 과거거나 10일 초과 미래여도 추천 흐름에 들어갈 수 있었음

**수정 후**

- body `dateTime`이 현재 시각보다 과거인 경우 400 반환
- body `dateTime`이 현재 시각 기준 10일 초과 미래인 경우 400 반환
- 위반 시 응답:

```json
{
  "status": 400,
  "message": "날짜는 현재 시각 이후 10일 이내만 입력 가능합니다."
}
```

**커밋명 추천**

`fix: 추천 요청 dateTime 범위 검증 추가`

---

## 수정 4. 외부 API 3초 timeout 및 warnings 응답 추가

**수정 전**

- `seoulOpenData.client.ts`, `kma.client.ts`의 fetch 호출에 timeout이 없어 외부 API 지연 시 추천 흐름이 오래 대기할 수 있었음
- 외부 API 실패/timeout 정보를 최종 추천 응답에 별도 표시하지 않았음

**수정 후**

- 서울 열린데이터 및 기상청 API fetch에 `AbortController` + `setTimeout` 기반 3초 timeout 적용
- timeout 또는 외부 API 실패 시 추천은 계속 진행
- 경고가 있을 때만 최종 응답에 `warnings` 배열 포함

```json
{
  "courses": [...],
  "warnings": [
    "날씨 정보를 가져오는 데 실패하여 날씨 없이 추천을 진행했습니다."
  ]
}
```

- 경고가 없으면 `warnings` 필드 미포함
- API 명세서(`docs/API.md`)에 정상 응답, warnings optional 필드, timeout 예시 반영

**커밋명 추천**

`feat: 외부 API timeout 및 추천 경고 응답 추가`

---

## 수정 5. 행정동 단위 생활인구 기반 혼잡도 표출

**수정 전**

- 추천 응답의 `congestion`이 서울 실시간 도시데이터 crowdLevel 중심으로 계산됨
- 이미 DB에 적재된 `living_population_stats`를 추천 응답 혼잡도에 사용하지 않음

**수정 후**

- 요청 지역/후보 장소의 지역명·주소·장소명을 기반으로 서울 자치구를 추정
- 자치구 코드 + 요청 `dateTime`의 KST 요일/시간대로 `living_population_stats` 조회
- 평균 생활인구를 `low` / `medium` / `high` / `unknown` 혼잡도로 변환해 추천 응답 `courses[].congestion`에 반영
- 혼잡도 스코어링도 생활인구 기반 혼잡도를 우선 사용
- 생활인구 조회가 실패하거나 해당 시간대 데이터가 없으면 추천은 계속 진행하고 필요 시 경고 추가

**커밋명 추천**

`feat: 생활인구 통계 기반 혼잡도 반영`

---

## 변경 파일 목록

| 파일 | 변경 내용 |
| ---- | --------- |
| `docs/API.md` | 에러 응답 형식, 추천 응답 `warnings`, `dateTime` 검증/우선순위, 생활인구 혼잡도 설명 반영 |
| `src/middlewares/errorHandler.ts` | 에러 응답 `{ status, message }` 통일, 일반 500 메시지 한글화 |
| `src/middlewares/auth.ts` | 인증 관련 영어 에러 메시지 한글화 |
| `src/controllers/recommendation.controller.ts` | 로그인 필요/ID 검증 에러 한글화 |
| `src/controllers/user.controller.ts` | 유저/선호값 검증 에러 한글화 |
| `src/controllers/place.controller.ts` | 장소 ID 검증 에러 한글화 |
| `src/services/user.service.ts` | 사용자 없음 에러 한글화 |
| `src/services/place.service.ts` | 장소 없음 에러 한글화 |
| `src/services/recommendation.service.ts` | 추천 요청 검증 한글화, body `dateTime` 검증, warnings 응답, 생활인구 혼잡도 우선 사용 |
| `src/services/scoring.service.ts` | 생활인구 기반 혼잡도를 스코어링에 우선 반영 |
| `src/clients/seoulOpenData.client.ts` | 모든 fetch 호출에 3초 timeout 적용 |
| `src/clients/kma.client.ts` | 모든 fetch 호출에 3초 timeout 적용 |
| `src/graphs/recommendation.state.ts` | `warnings`, `CongestionLevel`, `livingPopulation` context 추가 |
| `src/graphs/recommendation.graph.ts` | 그래프 초기 state에 `warnings` 추가 |
| `src/graphs/nodes/parseUserRequest.node.ts` | body `dateTime`이 query 상대 시간 파싱값에 덮이지 않도록 수정 |
| `src/graphs/nodes/fetchContextData.node.ts` | 외부 API 실패 warnings 생성, 생활인구 통계 조회 및 혼잡도 context 구성 |
| `src/graphs/nodes/formatRecommendationResult.node.ts` | 최종 그래프 결과에 warnings 포함 |

## 검증 결과

- `npm run build` 통과
- `npm run lint` 통과
