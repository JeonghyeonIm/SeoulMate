# ERROR_HANDLING

이 문서는 `SeoulMate_BE`의 현재 백엔드 기준 에러 처리 구조를 정리한다.  
특히 추천 API 호출 중 `verifyCandidatePlaces` 단계에서 발생하는 `KakaoQuotaExceededError`가 어떻게 `503 Service Unavailable`로 변환되는지 설명한다.

## 1. 전체 에러 처리 흐름

호출 스택 기준 대표 흐름은 아래와 같다.

1. 클라이언트가 추천 API를 호출한다.
2. 라우트가 컨트롤러(`recommendation.controller.ts`)로 요청을 전달한다.
3. 컨트롤러는 `try-catch` 안에서 서비스(`recommendationService.recommendCoursesForApi`)를 호출한다.
4. 서비스는 `runRecommendationGraphForApi()`를 실행한다.
5. 그래프는 `parseUserRequest -> fetchCandidatePlaces -> verifyCandidatePlaces -> fetchContextData -> scorePlaces` 순으로 노드를 실행한다.
6. `verifyCandidatePlacesNode` 내부의 `verifyPlace()`가 Kakao Local API 보조 조회를 수행한다.
7. 이 과정에서 Kakao 지도 클라이언트(`map.client.ts`)가 `429`를 받으면 `KakaoQuotaExceededError`를 throw한다.
8. `verifyPlace()`는 이 에러를 잡아서 `ApiError(503, "현재 장소 검색 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.")`로 변환해 다시 throw한다.
9. 그래프 실행이 중단되고, 예외는 서비스로 전파된다.
10. 서비스에서 별도 처리하지 않으면 예외는 그대로 컨트롤러까지 전파된다.
11. 컨트롤러의 `catch`가 `next(error)`를 호출한다.
12. Express 전역 미들웨어인 `errorHandler`가 최종 HTTP 응답을 만든다.

요약하면:

- 도메인/비즈니스 계층에서 예상 가능한 실패는 `ApiError`로 정규화한다.
- 컨트롤러는 응답을 직접 만들지 않고 `next(error)`로 에러를 위임한다.
- 실제 상태코드와 메시지 결정은 `errorHandler`가 담당한다.

## 2. ApiError 구조와 사용 방식

`ApiError`는 [`SeoulMate_BE/src/utils/ApiError.ts`](/abs/path/c:/Users/revo3/Desktop/kwon/08_portfolio/seoulmate/SeoulMate/SeoulMate_BE/src/utils/ApiError.ts:1)에 정의되어 있다.

구조:

```ts
export class ApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}
```

역할:

- HTTP 상태코드와 사용자 노출 메시지를 함께 전달한다.
- 서비스, 컨트롤러, 미들웨어 간에 "예상 가능한 요청 실패"를 공통 형식으로 전달한다.

현재 주된 사용 패턴:

- `400`: 요청 파라미터 검증 실패
- `401`: 인증 실패 또는 로그인 필요
- `404`: 조회 대상 없음
- `409`: 중복 저장 등 충돌
- `502`: 외부 로그인 처리 실패
- `503`: 외부 장소 검색 서비스 일시 불가

사용 원칙:

- 사용자가 이해 가능한 실패는 가능한 한 `ApiError`로 변환한다.
- 원인을 숨기면 안 되는 내부 버그는 불필요하게 `ApiError`로 바꾸지 않고 상위로 전파할 수 있다.
- 최종 응답 포맷은 `errorHandler`가 통일한다.

## 3. errorHandler 동작 방식

`errorHandler`는 [`SeoulMate_BE/src/middlewares/errorHandler.ts`](/abs/path/c:/Users/revo3/Desktop/kwon/08_portfolio/seoulmate/SeoulMate/SeoulMate_BE/src/middlewares/errorHandler.ts:1)에 있다.

현재 처리 순서는 아래와 같다.

### 3-1. `ApiError` 중 503이 아닌 경우

조건:

```ts
if (err instanceof ApiError && err.statusCode !== 503)
```

응답:

- `status`: `err.statusCode`
- `message`: `err.message`

예시:

- `400 잘못된 요청`
- `401 인증 실패`
- `404 리소스 없음`
- `409 중복 요청`
- `502 외부 연동 실패`

### 3-2. `ApiError` 중 503인 경우

조건:

```ts
if (err instanceof ApiError && err.statusCode === 503)
```

응답:

```json
{
  "status": 503,
  "message": "현재 장소 검색 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요."
}
```

의도:

- 외부 의존 서비스 일시 장애를 일반 서버 오류와 구분한다.
- 클라이언트가 재시도 가능한 장애로 인식할 수 있게 한다.

### 3-3. `status` 또는 `statusCode`가 있는 일반 에러이고 500 미만인 경우

조건:

```ts
const httpStatus = getHttpStatus(err);
if (httpStatus && httpStatus < 500)
```

응답:

- `400`이면 `"요청 형식이 올바르지 않습니다."`
- 그 외 `4xx`면 기본 메시지 `"서버 오류가 발생했습니다."`

특징:

- `ApiError`가 아닌 외부 라이브러리 에러 중 `4xx` 상태를 가진 경우를 최소한으로 방어한다.
- 메시지는 제한적으로 노출한다.

### 3-4. 그 외 모든 예외

처리:

- `logger.error(...)`로 로그를 남긴다.
- 클라이언트에는 `500`과 기본 메시지를 반환한다.

응답:

```json
{
  "status": 500,
  "message": "서버 오류가 발생했습니다."
}
```

## 4. KakaoQuotaExceededError 처리 흐름

관련 파일:

- [`SeoulMate_BE/src/clients/map.client.ts`](/abs/path/c:/Users/revo3/Desktop/kwon/08_portfolio/seoulmate/SeoulMate/SeoulMate_BE/src/clients/map.client.ts:1)
- [`SeoulMate_BE/src/graphs/nodes/verifyCandidatePlaces.node.ts`](/abs/path/c:/Users/revo3/Desktop/kwon/08_portfolio/seoulmate/SeoulMate/SeoulMate_BE/src/graphs/nodes/verifyCandidatePlaces.node.ts:1)
- [`SeoulMate_BE/src/middlewares/errorHandler.ts`](/abs/path/c:/Users/revo3/Desktop/kwon/08_portfolio/seoulmate/SeoulMate/SeoulMate_BE/src/middlewares/errorHandler.ts:1)

상세 흐름:

1. `mapClient.searchPlacesByKeyword()` 또는 `mapClient.geocodeAddress()`가 Kakao API를 호출한다.
2. Kakao 응답이 `429`이면 `map.client.ts`에서 `new KakaoQuotaExceededError()`를 throw한다.
3. `verifyCandidatePlaces.node.ts`의 `verifyPlace()` 전체가 `try-catch`로 감싸져 있다.
4. `catch`에서 `error instanceof KakaoQuotaExceededError`를 검사한다.
5. 맞으면 아래 `ApiError`로 변환한다.

```ts
throw new ApiError(503, "현재 장소 검색 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.");
```

6. 이 `ApiError(503)`는 그래프, 서비스, 컨트롤러를 거쳐 `errorHandler`까지 전달된다.
7. `errorHandler`의 503 전용 분기가 `503` 응답을 반환한다.

이 설계의 의미:

- 외부 API의 세부 예외 타입을 HTTP 응답 계층까지 노출하지 않는다.
- 그래프 내부 구현 세부사항을 컨트롤러가 알 필요가 없다.
- 클라이언트는 일관된 형태의 503 응답만 처리하면 된다.

## 5. 현재 처리되지 않는 예외 목록

현재 코드 기준으로 "완전히 미처리" 또는 "명시적 변환 없이 500으로 귀결될 수 있는" 예외는 아래와 같다.

### 5-1. `verifyPlace()` 밖에서 발생하는 비-Kakao 예외

예시:

- `fetch` 자체의 네트워크 예외
- JSON 파싱 예외
- 런타임 타입 오류

처리 결과:

- `KakaoQuotaExceededError`가 아니면 그대로 rethrow된다.
- 최종적으로 `errorHandler`에서 `500`으로 처리될 수 있다.

### 5-2. `verifyCandidatePlacesNode`의 병렬 처리 중 발생하는 일반 예외

`verifyInBatches()`는 `Promise.all()`을 사용한다.

의미:

- 한 장소 검증에서 일반 예외가 발생하면 해당 배치 전체가 reject된다.
- 부분 성공으로 계속 진행하지 않고 그래프 실행이 중단된다.

현재 상태:

- 의도된 fail-fast 동작일 수 있지만, 복구 전략은 아직 없다.

### 5-3. 추천 그래프 다른 노드의 비정규화 예외

예시:

- `fetchCandidatePlaces`
- `fetchContextData`
- `scorePlaces`
- 이후 코스 빌드/저장 로직

이 노드들에서 `ApiError`로 변환하지 않은 예외가 발생하면:

- 서비스/컨트롤러에서 별도 흡수하지 않는다.
- `errorHandler`가 로그 후 `500`으로 응답한다.

### 5-4. 저장소/DB 계층 예외

예시:

- 쿼리 실패
- 커넥션 오류
- 제약조건 예외 중 명시 변환되지 않은 경우

현재 상태:

- 대부분 상위에서 `ApiError`로 감싸지지 않는다.
- 결과적으로 `500`으로 응답할 가능성이 높다.

### 5-5. Kakao API의 429 외 실패 중 사용자 친화적 메시지 변환이 없는 경우

현재 `map.client.ts`는:

- `429`는 `KakaoQuotaExceededError`로 변환한다.
- 일부 `401`, `403`은 검색 기능을 비활성화하고 빈 배열을 반환한다.
- 그 외 비정상 응답은 대체로 `[]` 또는 `null`로 흡수한다.

남는 공백:

- 네트워크 단절, 타임아웃, 비정상 JSON 같은 예외는 별도 도메인 에러로 정규화되지 않는다.

## 6. 정리

현재 구조의 핵심은 다음 두 가지다.

- 예상 가능한 요청 실패는 `ApiError`로 통일한다.
- 예상하지 못한 실패는 `errorHandler`에서 로깅 후 `500`으로 마감한다.

이번 변경으로 추가된 보장은 다음과 같다.

- Kakao 장소 검색 쿼터 초과는 더 이상 일반 내부 오류처럼 보이지 않는다.
- 추천 API 호출자는 명확한 `503` 응답과 사용자 메시지를 받는다.
