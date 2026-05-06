# SeoulMate_BE Domain And Server Binding

## 개요

이 문서는 `seoulmate.my` 도메인, `EC2`, `EIP`, `Nginx`, 프런트엔드, 백엔드 API를 어떻게 서로 연결하는지 실제 값 기준으로 정리한 문서입니다.

현재 대화 기준 확인된 값은 아래와 같습니다.

- 도메인: `seoulmate.my`
- EC2 EIP: `13.209.103.176`
- 백엔드 실행 포트: `3000`

이 문서의 목적은 다음 4가지를 헷갈리지 않게 정리하는 것입니다.

1. 가비아 DNS에는 뭘 넣는가
2. 프런트에서는 어떤 주소를 API로 쓰는가
3. 백엔드 `.env`에는 뭘 넣는가
4. Nginx에는 뭘 넣는가

## 최종 목표 구조

```text
사용자
  -> seoulmate.my
  -> EC2 EIP 13.209.103.176
  -> Nginx
  -> 프런트 정적 파일

사용자/프런트
  -> api.seoulmate.my
  -> EC2 EIP 13.209.103.176
  -> Nginx
  -> Node.js backend (127.0.0.1:3000)
  -> RDS PostgreSQL
```

## 먼저 이해할 역할 분리

### 1. EIP

- EC2에 붙는 고정 공인 IP
- 현재 값: `13.209.103.176`

### 2. 가비아 DNS

- 도메인을 어느 IP로 보낼지 정하는 곳
- 여기에는 `EIP`를 넣습니다

### 3. 프런트엔드

- API를 호출할 때 `EIP`를 직접 쓰지 않고 `도메인`을 사용합니다
- 예: `api.seoulmate.my`

### 4. 백엔드 `.env`

- 여기에는 보통 `EIP`를 넣지 않습니다
- DB 정보, 포트, 시크릿 키 등을 넣습니다

### 5. Nginx

- `seoulmate.my` 요청은 프런트로 보냄
- `api.seoulmate.my` 요청은 백엔드 3000 포트로 프록시

## 실제 적용 순서

1. EC2에 EIP 연결 확인
2. 가비아 DNS 설정
3. 프런트 API 주소 설정
4. 백엔드 `.env` 설정
5. Nginx 설정
6. 서버 실행
7. 도메인 연결 확인

## 1. EC2에 EIP 연결 확인

현재 확인된 EIP:

```text
13.209.103.176
```

이 값이 EC2에 연결되어 있어야 합니다.

AWS 콘솔에서 확인 위치:

- `EC2 -> 탄력적 IP`
- `EC2 -> 인스턴스 상세 -> 탄력적 IP 주소`

## 2. 가비아 DNS 설정

가비아 DNS에는 `도메인 -> EIP` 연결값을 넣습니다.

경로:

- `My가비아 > 서비스 관리 > DNS 관리툴 > 해당 도메인 > 설정`

### 2-1. 프런트용 루트 도메인

`seoulmate.my`를 프런트 주소로 쓰려면:

```text
타입: A
호스트: @
값: 13.209.103.176
TTL: 기본값
```

의미:

```text
seoulmate.my -> 13.209.103.176
```

### 2-2. 백엔드 API용 서브도메인

`api.seoulmate.my`를 백엔드 주소로 쓰려면:

```text
타입: A
호스트: api
값: 13.209.103.176
TTL: 기본값
```

의미:

```text
api.seoulmate.my -> 13.209.103.176
```

### 2-3. 가비아에 최종적으로 들어갈 값

정리하면, 가비아 DNS 관리툴에 넣을 값은 이 2개입니다.

```text
A / @   / 13.209.103.176
A / api / 13.209.103.176
```

### 2-4. 주의사항

- 가비아 기본 파킹 레코드가 있으면 삭제 필요할 수 있음
- DNS 반영은 수분~수시간, 길면 최대 48시간

## 3. 프런트엔드에서 쓸 API 주소

프런트엔드는 `EIP`를 직접 쓰지 않고 **도메인**을 씁니다.

### 개발 중 HTTP 예시

```env
VITE_API_BASE_URL=http://api.seoulmate.my
```

### HTTPS 적용 후 예시

```env
VITE_API_BASE_URL=https://api.seoulmate.my
```

### 핵심

프런트가 API 호출할 때 써야 하는 값은:

```text
api.seoulmate.my
```

이지, `13.209.103.176`가 아닙니다.

## 4. 백엔드 `.env`에 넣을 값

백엔드 `.env`에는 `EIP`나 프런트 도메인을 넣는 것이 아니라, 서버 실행과 DB 연결 정보를 넣습니다.

예시:

```env
NODE_ENV=production
PORT=3000

DATABASE_URL=
DATABASE_SSL=true

POSTGRES_HOST=<RDS endpoint>
POSTGRES_PORT=5432
POSTGRES_DB=seoulmate
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<RDS password>
```

### 핵심

- 여기에는 `13.209.103.176` 안 넣음
- 여기에는 `api.seoulmate.my`도 보통 안 넣음
- RDS 연결 정보가 핵심

## 5. Nginx 설정

Nginx는 들어온 도메인에 따라 프런트/백엔드를 분리합니다.

## 5-1. 프런트 + 백엔드 같이 쓰는 권장 설정

```nginx
server {
    listen 80;
    server_name seoulmate.my www.seoulmate.my;

    root /var/www/seoulmate-frontend;
    index index.html;

    location / {
        try_files $uri /index.html;
    }
}

server {
    listen 80;
    server_name api.seoulmate.my;

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

## 5-2. 의미

- `seoulmate.my` -> 프런트 정적 파일
- `api.seoulmate.my` -> Node.js 백엔드

## 5-3. 저장 위치 예시

```text
/etc/nginx/conf.d/seoulmate.conf
```

## 5-4. 적용 명령

```bash
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## 6. 백엔드 실행

백엔드는 EC2 안에서 `3000` 포트로 떠 있어야 합니다.

예시:

```bash
npm install
npm run build
pm2 start dist/server.js --name seoulmate-be
```

확인:

```bash
pm2 status
curl http://127.0.0.1:3000/health
```

## 7. 도메인 연결 확인

### DNS 확인

```bash
nslookup seoulmate.my
nslookup api.seoulmate.my
```

정상이라면 둘 다 `13.209.103.176`로 나와야 합니다.

### HTTP 확인

```bash
curl http://seoulmate.my
curl http://api.seoulmate.my/health
```

## 8. 최종 입력값만 다시 요약

## 가비아 DNS

```text
A / @   / 13.209.103.176
A / api / 13.209.103.176
```

## 프런트 환경변수

```env
VITE_API_BASE_URL=http://api.seoulmate.my
```

HTTPS 적용 후:

```env
VITE_API_BASE_URL=https://api.seoulmate.my
```

## 백엔드 `.env`

```env
NODE_ENV=production
PORT=3000

DATABASE_URL=
DATABASE_SSL=true
POSTGRES_HOST=<RDS endpoint>
POSTGRES_PORT=5432
POSTGRES_DB=seoulmate
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<RDS password>
```

## Nginx 도메인

```text
seoulmate.my
api.seoulmate.my
```

## 9. 가장 많이 헷갈리는 부분 한 줄 정리

- **가비아 DNS**에는 `EIP`를 넣는다
- **프런트**는 `api.seoulmate.my`를 API 주소로 쓴다
- **백엔드 `.env`**에는 `RDS 정보`를 넣는다
- **Nginx**는 `seoulmate.my`와 `api.seoulmate.my`를 기준으로 분기한다

## 관련 문서

- [DOMAIN_SETUP.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DOMAIN_SETUP.md)
- [DEPLOYMENT.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DEPLOYMENT.md)
- [VPC_SETUP.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/VPC_SETUP.md)
