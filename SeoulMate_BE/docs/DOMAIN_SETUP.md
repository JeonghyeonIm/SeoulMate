# SeoulMate_BE Domain Setup

## 개요

이 문서는 가비아에서 구매한 도메인을 `SeoulMate_BE` 서버에 연결하는 방법을 정리한 문서입니다.
현재 배포 구조는 아래를 전제로 합니다.

- 서버: `EC2`
- DB: `RDS PostgreSQL`
- 외부 접속 IP: `EC2 EIP`

도메인 연결 방식은 2가지가 있습니다.

1. 가비아 DNS를 그대로 사용
2. AWS Route 53으로 네임서버를 넘겨서 DNS를 AWS에서 관리

실무적으로 `EC2 EIP`에 웹 서버만 연결할 목적이면 **가비아 DNS 유지 방식**이 더 단순합니다.

## 어떤 방식을 선택할지

### 1. 가비아 DNS 유지 방식

이 방식은:

- 네임서버는 가비아 그대로 유지
- DNS 레코드만 가비아에서 설정
- `A 레코드 -> EC2 EIP` 연결

이런 상황에 적합합니다.

- 빠르게 배포하고 싶을 때
- 도메인 연결만 간단히 할 때
- Route 53까지 굳이 쓰지 않을 때

### 2. Route 53 사용 방식

이 방식은:

- Route 53 Public Hosted Zone 생성
- AWS가 준 NS 4개를 가비아에 등록
- DNS 레코드는 AWS에서 관리

이런 상황에 적합합니다.

- DNS를 AWS로 일원화하고 싶을 때
- 향후 AWS 리소스를 더 적극적으로 연결할 때
- Route 53에 익숙하거나 운영을 AWS 중심으로 할 때

## 권장 방식

현재 `SeoulMate_BE` 상황에서는 보통 아래가 가장 좋습니다.

- **가비아 DNS 유지**
- `A 레코드`로 `EC2 EIP` 연결

이 방식이면 네임서버 변경이 필요 없고, 가장 빠르게 연결할 수 있습니다.

## 방식 1. 가비아 DNS 유지 방식

## 개념

```text
User
 -> domain
 -> gabia DNS
 -> A record
 -> EC2 EIP
 -> EC2
```

## 절차

### 1. EC2에 EIP 연결

먼저 EC2에 Elastic IP가 연결되어 있어야 합니다.

예:

- `43.xx.xx.xx`

### 2. 가비아 DNS 관리툴 접속

가비아 공식 안내 기준 경로:

- `My가비아 > 서비스 관리 > DNS 관리툴`

### 3. 기존 파킹 레코드 확인

가비아는 기본적으로 파킹용 A 레코드가 들어 있을 수 있습니다.
새 서버 IP로 연결하려면 기존 파킹 레코드를 삭제해야 할 수 있습니다.

### 4. 루트 도메인 연결

예를 들어 `example.com` 자체를 연결하려면:

- Type: `A`
- Host: `@` 또는 빈값
- Value: `EC2 EIP`

예:

```text
example.com -> 43.xx.xx.xx
```

### 5. 서브도메인 연결

예를 들어 API 서버를 `api.example.com`으로 쓰려면:

- Type: `A`
- Host: `api`
- Value: `EC2 EIP`

예:

```text
api.example.com -> 43.xx.xx.xx
```

### 6. 저장 후 전파 대기

- DNS 반영은 즉시 되지 않을 수 있습니다.
- 일반적으로 수분~수시간, 길면 최대 48시간까지 걸릴 수 있습니다.

## 추천 레코드 예시

### 루트 도메인 + API 서브도메인 모두 연결

- `A` / `@` / `43.xx.xx.xx`
- `A` / `api` / `43.xx.xx.xx`

### 프론트 없이 API만 분리 운영

- `A` / `api` / `43.xx.xx.xx`

이 경우:

- 백엔드: `api.example.com`
- 루트 도메인: 나중에 프론트 또는 랜딩 페이지용으로 비워둘 수 있음

## 방식 2. Route 53 사용 방식

## 개념

```text
User
 -> domain
 -> Route 53 NS
 -> Route 53 record
 -> EC2 EIP
 -> EC2
```

## 절차

### 1. Route 53 Hosted Zone 생성

AWS 공식 경로:

- `Route 53 -> Hosted zones -> Create hosted zone`

설정:

- Domain name: 예) `example.com`
- Type: `Public hosted zone`

### 2. NS 서버 4개 확인

Hosted zone 생성 후 AWS는 자동으로 NS 레코드 4개를 부여합니다.

예시 형식:

- `ns-123.awsdns-45.com`
- `ns-456.awsdns-67.net`
- `ns-789.awsdns-10.org`
- `ns-999.awsdns-20.co.uk`

### 3. 가비아에서 네임서버 변경

가비아 공식 경로:

- `My가비아 > 서비스 관리 > 도메인 관리툴 > 도메인 정보 변경 > 네임서버`

작업:

1. 기존 네임서버 삭제
2. Route 53의 NS 4개 입력
3. 저장

주의:

- 가비아 공식 안내상 **호스트명만 입력**합니다.
- 최소 2개 이상 필요합니다.
- 네임서버 변경 시 기존 웹/메일 연결이 잠시 끊길 수 있습니다.

### 4. Route 53에서 레코드 생성

그다음 DNS 레코드는 AWS에서 만듭니다.

예:

- `A` / `api.example.com` / `43.xx.xx.xx`
- `A` / `example.com` / `43.xx.xx.xx`

## 어떤 경우에 어느 방식을 쓸지

### 가비아 DNS 유지가 더 좋은 경우

- 지금 당장 빠르게 배포해야 함
- AWS DNS까지 굳이 쓸 필요 없음
- 단순히 EIP에 도메인 연결만 하면 됨

### Route 53이 더 좋은 경우

- DNS 운영을 AWS로 통합하고 싶음
- 나중에 ALB, CloudFront 등 AWS 서비스와 더 자연스럽게 엮고 싶음
- 여러 서브도메인/레코드를 체계적으로 관리하고 싶음

## 현재 프로젝트 기준 추천

현재 `SeoulMate_BE` 기준 추천은 다음과 같습니다.

### 가장 단순한 권장안

1. EC2에 EIP 연결
2. 가비아 DNS 유지
3. `api` 서브도메인 A 레코드 생성

예:

```text
api.seoulmate-example.com -> EC2 EIP
```

이 방식이 가장 실수도 적고 빠릅니다.

## 연결 확인 방법

### DNS 확인

```bash
nslookup api.example.com
```

또는

```bash
dig api.example.com
```

### HTTP 확인

```bash
curl http://api.example.com/health
```

### HTTPS 확인

```bash
curl https://api.example.com/health
```

## 흔한 실수

### 1. EIP 없이 퍼블릭 IP로 연결

- 나중에 IP가 바뀌면 도메인도 다시 수정해야 합니다.

### 2. 네임서버를 Route 53으로 넘겨놓고 레코드는 가비아에서 수정

- 이 경우 반영되지 않습니다.
- 네임서버 권한이 어디 있느냐가 중요합니다.

### 3. 가비아 파킹 레코드 삭제 안 함

- 기존 파킹 페이지가 계속 뜰 수 있습니다.

### 4. Nginx `server_name` 미설정

- 도메인은 연결됐는데 웹 서버가 제대로 응답하지 않을 수 있습니다.

## Nginx 연동 예시

도메인을 붙였다면 Nginx 설정도 맞춰야 합니다.

예:

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## HTTPS 적용

도메인이 정상 연결된 뒤에 HTTPS를 적용합니다.

예:

```bash
sudo certbot --nginx -d api.example.com
```

## 최종 추천 흐름

1. VPC / subnet / route / SG 구성
2. EC2 생성
3. EIP 연결
4. RDS 생성
5. Nginx / PM2 배포
6. 가비아 DNS에서 `A 레코드 -> EIP` 연결
7. HTTPS 적용

## 관련 문서

- 네트워크 구성: [VPC_SETUP.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/VPC_SETUP.md)
- 보안 그룹: [AWS_SECURITY_GROUPS.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/AWS_SECURITY_GROUPS.md)
- 실제 배포: [DEPLOYMENT.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DEPLOYMENT.md)

## 참고 자료

- 가비아 네임서버 변경 안내:
  - https://customer.gabia.com/manual/31/286/991
- 가비아 DNS 레코드 설정 안내:
  - https://customer.gabia.com/faq/detail/2929/2932
- 가비아 A 레코드/파킹 관련 안내:
  - https://customer.gabia.com/faq/detail/2929/2939
- AWS Route 53 Hosted Zone 생성:
  - https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/CreatingHostedZone.html
- AWS Route 53 NS 확인:
  - https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/GetInfoAboutHostedZone.html
