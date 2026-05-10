# HttpOnly Cookie 전환 작업 문서

## 1. 작업 배경

- 기존 리프레시 토큰은 응답 body 또는 프론트엔드에서 접근 가능한 저장소를 통해 다뤄지고 있었고, JavaScript에서 접근 가능한 형태라 XSS 발생 시 탈취 위험이 있었습니다.
- 리프레시 토큰을 `HttpOnly` 쿠키로 전환해 브라우저 JavaScript에서 직접 접근하지 못하도록 변경했습니다.
- 액세스 토큰은 기존처럼 응답 body에 유지하고, 리프레시 토큰만 쿠키로 분리했습니다.

## 2. 변경 전 / 변경 후 비교

| 항목                                | 변경 전                                      | 변경 후                                       |
| ----------------------------------- | -------------------------------------------- | --------------------------------------------- |
| 액세스 토큰 저장 방식               | 응답 body 반환                               | 응답 body 반환                                |
| 리프레시 토큰 저장 방식             | 응답 body 반환, OAuth 콜백 URL 파라미터 포함 | `Set-Cookie` 헤더로 `HttpOnly` 쿠키 발급      |
| JS에서 리프레시 토큰 접근 가능 여부 | 가능                                         | 불가 (`HttpOnly`)                             |
| refresh/logout 요청 방식            | `req.body.refreshToken` 전달                 | `req.cookies['seoulmate-refresh-token']` 사용 |

## 3. 쿠키 스펙

현재 컨트롤러에서 사용하는 쿠키 스펙은 아래와 같습니다.

```ts
const REFRESH_TOKEN_COOKIE_NAME = "seoulmate-refresh-token";

const getRefreshTokenCookieOptions = (maxAge: number): CookieOptions => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "strict",
  domain: ".seoulmate.my",
  path: "/api/auth",
  maxAge
});
```

| 항목       | 값                                     | 이유                                             |
| ---------- | -------------------------------------- | ------------------------------------------------ |
| 이름       | `seoulmate-refresh-token`              | 리프레시 토큰 전용 쿠키임을 명확히 구분          |
| `HttpOnly` | `true`                                 | JavaScript 접근 차단으로 XSS 노출면 축소         |
| `Secure`   | `process.env.COOKIE_SECURE === "true"` | HTTPS 환경에서만 전송하도록 토글 가능            |
| `SameSite` | `'strict'`                             | 교차 사이트 요청에서 쿠키 전송을 제한            |
| `Domain`   | `.seoulmate.my`                        | 서브도메인 범위를 포함한 서비스 도메인 공유 목적 |
| `Path`     | `/api/auth`                            | 인증 관련 경로에만 쿠키 전송 범위 제한           |
| `Max-Age`  | `604800000` ms                         | 7일 유지                                         |

주의:

- `COOKIE_SECURE`는 현재 `src/config/env.ts`, `.env`, `.env.example`에 정의되어 있지 않습니다.
- 현재 코드는 컨트롤러에서 직접 `process.env.COOKIE_SECURE === "true"`를 사용합니다.
- TODO: `COOKIE_SECURE`를 환경변수 스펙 문서와 설정 파일에 반영할지 별도 결정 필요

## 4. 수정된 파일 목록과 변경 내용 요약

### `package.json`

- `cookie-parser`를 `dependencies`에 추가했습니다.
- `@types/cookie-parser`를 `devDependencies`에 추가했습니다.
- 이유: 쿠키 파싱 미들웨어와 TypeScript 타입 지원이 필요합니다.

### `src/app.ts`

- `cors()` 기본 설정을 아래처럼 변경했습니다.

```ts
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true
  })
);
```

- `cookie-parser`를 `express.json()`보다 먼저 등록했습니다.

```ts
app.use(httpLogger);
app.use(cookieParser());
app.use(express.json());
```

- 이유:
  - 브라우저가 인증 쿠키를 포함해 요청할 수 있도록 `credentials: true`가 필요합니다.
  - 컨트롤러에서 `req.cookies`를 읽으려면 쿠키 파서가 먼저 등록돼야 합니다.

### `src/types/auth.types.ts`

- `AuthResponseBody`에서 `refreshToken` 필드를 제거했습니다.
- 이유: 리프레시 토큰은 더 이상 응답 body 계약에 포함되지 않고 쿠키로만 내려가야 합니다.

### `src/services/auth.service.ts`

- 서비스 반환값을 body와 refresh token으로 분리했습니다.

```ts
export interface AuthServiceResult {
  body: AuthResponseBody;
  refreshToken: string;
}
```

- `buildAuthResponse()`는 이제 `AuthResponseBody` 안에 `refreshToken`을 넣지 않고, `refreshToken`을 별도 필드로 반환합니다.
- 이유: 쿠키 발급 책임은 controller에 두고, service는 비즈니스 로직과 토큰 생성 결과만 전달하도록 분리했습니다.

### `src/controllers/auth.controller.ts`

- 회원가입/로그인/리프레시/OAuth 콜백에서 `refreshToken`을 `Set-Cookie`로 발급하도록 변경했습니다.
- `/refresh`, `/logout`은 body 대신 `req.cookies['seoulmate-refresh-token']`에서 토큰을 읽도록 변경했습니다.
- `/logout`은 동일 속성으로 `maxAge: 0` 쿠키를 내려 삭제하도록 변경했습니다.
- OAuth 콜백 리다이렉트 URL에서는 `refreshToken`을 제거하고 `accessToken`만 전달하도록 변경했습니다.
- 이유: 리프레시 토큰을 브라우저 JS에서 숨기고 인증 쿠키 흐름으로 전환하기 위함입니다.

## 5. 엔드포인트별 변경 사항

### `POST /api/auth/login`

- 변경 전:
  - `refreshToken`이 응답 body에 포함됨
- 변경 후:
  - 응답 body에는 `result.body`만 포함
  - `result.refreshToken`은 쿠키로 발급

```ts
const result = await login(email, password);
setRefreshTokenCookie(res, result.refreshToken);
res.status(200).json(result.body);
```

### `POST /api/auth/signup`

- 변경 전:
  - `refreshToken`이 응답 body에 포함됨
- 변경 후:
  - 응답 body에는 `result.body`만 포함
  - `result.refreshToken`은 쿠키로 발급

```ts
const result = await signup(payload);
setRefreshTokenCookie(res, result.refreshToken);
res.status(201).json(result.body);
```

### `POST /api/auth/refresh`

- 변경 전:
  - `req.body.refreshToken` 사용
- 변경 후:
  - `req.cookies['seoulmate-refresh-token']` 사용
  - 쿠키가 없으면 `401`
  - 새 리프레시 토큰을 쿠키로 재발급

```ts
const result = await refreshAuth(getRefreshTokenFromCookie(req));
setRefreshTokenCookie(res, result.refreshToken);
res.status(200).json(result.body);
```

### `POST /api/auth/logout`

- 변경 전:
  - `req.body.refreshToken` 사용
  - 쿠키 삭제 없음
- 변경 후:
  - `req.cookies['seoulmate-refresh-token']` 사용
  - 쿠키가 없으면 `401`
  - 로그아웃 후 동일 속성으로 `maxAge: 0` 쿠키를 내려 삭제

```ts
await logout(getRefreshTokenFromCookie(req));
setRefreshTokenCookie(res, "", 0);
res.status(204).send();
```

### OAuth 콜백 (`GET /api/auth/kakao/callback`, `GET /api/auth/google/callback`)

- 변경 전:
  - 리다이렉트 URL에 `accessToken`, `refreshToken` 모두 포함
- 변경 후:
  - `refreshToken`은 쿠키로 발급
  - URL 파라미터에는 `accessToken`만 포함

```ts
const params = new URLSearchParams({
  accessToken: result.body.accessToken
});
setRefreshTokenCookie(res, result.refreshToken);
res.redirect(`${env.FRONTEND_URL}/auth/callback?${params}`);
```

## 6. CORS 설정 변경 내용

- 기존 설정:

```ts
app.use(cors());
```

- 변경 후:

```ts
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true
  })
);
```

- 의미:
  - `origin`을 `env.FRONTEND_URL`로 제한했습니다.
  - 브라우저가 인증 쿠키를 포함해 요청하려면 `credentials: true`가 필요합니다.

## 7. 개발 환경 주의사항

- 로컬 개발 환경이 HTTP라면 `Secure` 속성이 켜져 있을 때 브라우저가 쿠키를 보내지 않을 수 있습니다.
- 현재 구현은 `process.env.COOKIE_SECURE === "true"`일 때만 `secure: true`가 됩니다.
- 운영 HTTPS 환경에서는 `COOKIE_SECURE=true`가 필요합니다.
- 로컬 HTTP 환경에서는 `COOKIE_SECURE=false`가 필요할 수 있습니다.
- TODO: `COOKIE_SECURE`를 `src/config/env.ts`에서 정식으로 파싱해 공통 설정으로 관리할지 결정 필요

## 포스트맨 검증 결과

검증 환경:

- 로컬 서버 (`http://localhost:3000`)
- `COOKIE_SECURE=false`

검증 순서 및 결과:

1. `POST /api/auth/signup` — `201`, `seoulmate-refresh-token` 쿠키 저장 확인
2. `POST /api/auth/login` — `200`, body에 `refreshToken` 없음, `Set-Cookie` 확인
3. `POST /api/auth/refresh` — `200`, 쿠키 자동전송, 새 `accessToken` 발급, 쿠키 재발급 확인
4. `POST /api/auth/logout` — `204`, `Max-Age=0` 쿠키 삭제 확인
5. 로그아웃 후 `POST /api/auth/refresh` — `401` 확인

전체 검증 통과.
