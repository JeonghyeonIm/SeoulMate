# SeoulMate 백엔드 구현 현황 정리

## 1. 초기 대비 구현된 것

| 영역 | 초기 상태 | 지금 상태 |
| --- | --- | --- |
| LangGraph 추천 흐름 | 없음/미연결 수준 | `parse → 후보조회 → 지도검증 → 실시간/날씨 → 스코어링 → 코스구성 → 검증 → AI설명 → 결과정리` 그래프 구현 |
| 코스 추천 요청 | 문자열 `input` 중심 | 명세처럼 JSON 요청 지원: `vibes`, `region`, `budget`, `duration`, `purpose`, `query` |
| 코스 추천 응답 | 내부 state/result 형태 | 명세처럼 `{ courses: [...] }` 반환 |
| 코스 상세 조회 | 미흡/내부 DB 형태 | `id`, `title`, `description`, `totalCost`, `duration`, `congestion`, `places[]` 형태 구현 |
| 장소 검색/상세 | `public_data` 원본 반환 위주 | `/places/search`, `/places/:id` 명세 응답 형태 구현 |
| 인증 | 부분 구현 | `signup/login/refresh/logout` + JWT access/refresh 동작 |
| 유저 API | 부분 구현 | `/users/me`, `/users`, `/users/:id`, `/users/me/preferences` 명세형 응답 구현 |
| 코스 저장 | 부분 구현 | 저장, 저장취소, 저장목록 구현 |
| ID 형식 | 숫자 ID | 응답은 `crs_45`, `plc_290538` 형태. 요청은 prefix/숫자 둘 다 파싱 |
| 날씨 분기 | 불명확/한꺼번에 호출 위험 | 실시간 `citydata`, 초단기, 단기, 중기, 11일 이후 `unavailable` 분기 |
| 지도/거리 | fallback 위주 | Kakao walking route 연결 + fallback. Kakao Local 후보 검증 노드 추가 |
| 후보 품질 | 지역명 title 매칭으로 이상 후보 섞임 | 서울 지역 alias/구 단위 필터, 좌표 있는 장소 우선, 지도 검증 우선 반영 |
| 테스트 | 없음 | build/lint 통과, 실제 HTTP 20개 추천 + 상세 조회 전부 PASS |

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

| 항목 | 상태 | 이유 |
| --- | --- | --- |
| 관리자 권한 403 | 미구현 | DB에 `role`, `is_admin` 같은 컬럼 없음 |
| refreshToken 실제 무효화 | 미구현 | refresh token 저장/블랙리스트 테이블 없음. 현재는 검증 후 204 |
| 예산 선호 저장 | 미구현 | `users` 테이블에 budget 컬럼 없음 |
| 미래 혼잡도 분석 | 미구현 | 상권분석서비스 데이터셋이 현재 DB에 없음 |
| Kakao 별점/후기 수 기반 정렬 | 불가/미구현 | Kakao Local 공식 응답에 별점/리뷰 수 없음 |
| Kakao Local 후보 검증 | 코드 구현, 실제 호출 실패 | 현재 REST Local API 호출이 403. 키 권한 확인 필요 |
| STT 음성 입력 | 미구현 | 현재는 텍스트/query 기준 |
| 코스 여러 개 추천 | 현재 1개 | 명세는 `courses[]`지만 지금은 추천 코스 1개 반환 |
| 추천 결과 완전 보존 | 부분 구현 | 상세 조회 시 title/duration 일부 재계산됨 |
| 운영시간 정확도 | 부분 구현 | metadata 기반 추정, 없으면 “방문 전 확인 필요” |
| 가격 정확도 | 부분 구현 | 공공데이터 fee가 있으면 사용, 없으면 카테고리 추정 |

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
