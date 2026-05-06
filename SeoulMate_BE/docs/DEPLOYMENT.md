# SeoulMate_BE Deployment

## 개요

이 문서는 `SeoulMate_BE`를 AWS에 실제로 배포하는 전체 과정을 정리합니다.
구성은 아래를 기준으로 합니다.

- `EC2`: 백엔드 서버 실행
- `RDS PostgreSQL`: 데이터베이스
- `EIP`: EC2 고정 공인 IP
- `Nginx`: 리버스 프록시
- `PM2`: Node.js 프로세스 관리

목표 구조:

```text
Client
  -> Domain or EIP
  -> EC2
     -> Nginx
        -> Node.js (SeoulMate_BE)
           -> RDS PostgreSQL
```

## 사전 준비

배포 전에 아래가 준비되어 있어야 합니다.

- VPC / subnet / route table 구성 완료
- EC2 인스턴스 생성 완료
- RDS PostgreSQL 생성 완료
- EC2 / RDS security group 연결 완료
- EIP 할당 가능 상태
- Git 저장소 준비
- `.env`에 넣을 DB 접속 정보 확보

관련 문서:

- [VPC_SETUP.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/VPC_SETUP.md)
- [AWS_SECURITY_GROUPS.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/AWS_SECURITY_GROUPS.md)
- [DB.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DB.md)

## 전체 순서 요약

1. EIP 할당 및 EC2 연결
2. EC2 접속
3. 서버 기본 패키지 설치
4. Node.js / npm 설치
5. PostgreSQL 클라이언트 설치
6. 프로젝트 코드 배치
7. 환경 변수 설정
8. RDS 접속 확인
9. DB 마이그레이션 / 시드 적용
10. 애플리케이션 빌드
11. PM2로 서버 실행
12. Nginx 리버스 프록시 설정
13. 도메인 연결
14. HTTPS 적용

## 1. EIP 할당 및 EC2 연결

서버를 안정적으로 운영하려면 EC2에 고정 공인 IP를 붙이는 것이 좋습니다.

### AWS 콘솔 경로

`EC2 -> Elastic IPs -> Allocate Elastic IP address`

### 절차

1. `Allocate Elastic IP address`
2. 생성된 EIP 선택
3. `Actions -> Associate Elastic IP address`
4. Resource type: `Instance`
5. Instance: `seoulmate-ec2`
6. 연결

### 설명

- 일반 퍼블릭 IP는 인스턴스 재시작/재생성 시 바뀔 수 있습니다.
- EIP를 붙이면 도메인 연결과 운영이 훨씬 안정적입니다.
- EIP는 "할당만 하고 연결하지 않으면" 과금될 수 있으니 주의합니다.

## 2. EC2 접속

로컬에서:

```bash
ssh -i <your-key.pem> ec2-user@<EC2-EIP>
```

Ubuntu AMI면:

```bash
ssh -i <your-key.pem> ubuntu@<EC2-EIP>
```

## 3. 서버 기본 패키지 설치

Amazon Linux 계열 예시:

```bash
sudo yum update -y
```

Ubuntu 계열 예시:

```bash
sudo apt update && sudo apt upgrade -y
```

## 4. Node.js / npm 설치

Node.js 20 LTS 기준 예시입니다.

### Amazon Linux / NodeSource 예시

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### Ubuntu / NodeSource 예시

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

설치 확인:

```bash
node -v
npm -v
```

## 5. PostgreSQL 클라이언트 설치

RDS 연결 확인과 SQL 적용을 위해 `psql`이 있으면 편합니다.

### Amazon Linux 예시

```bash
sudo yum install -y postgresql15
```

### Ubuntu 예시

```bash
sudo apt install -y postgresql-client
```

## 6. 프로젝트 코드 배치

### 방법 1. Git clone

```bash
git clone <repository-url>
cd SeoulMate/SeoulMate_BE
```

### 방법 2. 직접 업로드

- GitHub 사용이 어렵다면 SFTP/ZIP 업로드도 가능

## 7. 환경 변수 설정

프로젝트 루트 `SeoulMate_BE`에 `.env`를 만듭니다.

예시:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=
DATABASE_SSL=true
POSTGRES_HOST=seoulmate-db.xxxxx.ap-northeast-2.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DB=seoulmate
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
```

설명:

- `DATABASE_URL`을 비워두면 현재 프로젝트는 `POSTGRES_*` 조합을 사용합니다.
- RDS는 보통 SSL 연결이 필요하므로 `DATABASE_SSL=true` 권장

## 8. RDS 접속 확인

### 포트 확인

```bash
nc -zv <rds-endpoint> 5432
```

### PostgreSQL 직접 접속 확인

```bash
psql -h <rds-endpoint> -U <db-user> -d <db-name> -p 5432
```

여기서 접속이 안 되면 보통 아래 문제입니다.

- RDS SG에서 `5432`가 EC2 SG에 안 열림
- EC2와 RDS가 다른 VPC/Subnet 구조에 있음
- RDS가 아직 `available` 상태가 아님
- 계정/비밀번호가 틀림

## 9. DB 마이그레이션 / 시드 적용

현재 프로젝트 기준 SQL 파일:

- [20260506_initial_schema.sql](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/db/migrations/20260506_initial_schema.sql)
- [seed.sql](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/db/seed.sql)

### 마이그레이션 적용

```bash
psql -h <rds-endpoint> -U <db-user> -d <db-name> -f db/migrations/20260506_initial_schema.sql
```

### 시드 적용

```bash
psql -h <rds-endpoint> -U <db-user> -d <db-name> -f db/seed.sql
```

## 10. 애플리케이션 의존성 설치 및 빌드

프로젝트 루트에서:

```bash
npm install
npm run build
```

선택 확인:

```bash
npm run lint
```

## 11. PM2로 서버 실행

### PM2 설치

```bash
sudo npm install -g pm2
```

### 앱 실행

```bash
pm2 start dist/server.js --name seoulmate-be
```

### 상태 확인

```bash
pm2 status
pm2 logs seoulmate-be
```

### 재부팅 후 자동 시작

```bash
pm2 startup
pm2 save
```

## 12. Nginx 설치 및 리버스 프록시 설정

Node 서버를 외부에 직접 노출하기보다 Nginx 뒤에 두는 것이 좋습니다.

### Nginx 설치

Amazon Linux 예시:

```bash
sudo yum install -y nginx
```

Ubuntu 예시:

```bash
sudo apt install -y nginx
```

### Nginx 설정 파일 예시

`/etc/nginx/conf.d/seoulmate.conf`

```nginx
server {
    listen 80;
    server_name _;

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

### 설정 확인 및 재시작

```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

## 13. 동작 확인

EC2에서:

```bash
curl http://127.0.0.1:3000/health
```

외부에서:

```bash
curl http://<EC2-EIP>/health
```

또는

```bash
curl http://<EC2-EIP>/api
```

## 14. 도메인 연결

도메인이 있다면 DNS에서 아래처럼 연결합니다.

- `A Record`
- Host: 예) `api`
- Value: `EC2 EIP`

예:

```text
api.yourdomain.com -> 43.xx.xx.xx
```

도메인을 가비아에서 구매했다면 연결 방식은 아래 문서를 같이 참고합니다.

- [DOMAIN_SETUP.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DOMAIN_SETUP.md)

## 15. HTTPS 적용

운영 기준으로는 HTTPS 적용을 권장합니다.

### 일반적인 방법

- Nginx + Let's Encrypt + Certbot

Ubuntu 예시:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

## 배포 후 점검 체크리스트

- EC2에 EIP 연결됨
- EC2에서 앱 프로세스 실행 중
- Nginx 정상 동작
- RDS 연결 성공
- `/health` 응답 정상
- `/api` 응답 정상
- 마이그레이션 적용 완료
- 시드 데이터 적재 완료
- 보안 그룹 최소 권한 적용 확인

## 흔한 실수

### 1. RDS만 만들고 테이블 생성 안 함

- RDS 인스턴스 생성과 테이블 생성은 별개입니다.

### 2. PM2 없이 `npm run dev`만 켜둠

- 운영 배포용으로는 적절하지 않습니다.

### 3. Nginx 없이 3000 포트를 외부에 그대로 노출

- 빠른 테스트는 가능하지만 운영 구조로는 좋지 않습니다.

### 4. EIP 없이 퍼블릭 IP만 사용

- IP가 바뀔 수 있어 도메인/접속 관리가 불안정합니다.

### 5. `.env`를 Git에 올림

- 실제 비밀번호는 절대 버전 관리에 포함하면 안 됩니다.

## 추천 운영 흐름

### 초기 배포

1. VPC 구성
2. EC2 생성
3. EIP 연결
4. RDS 생성
5. 보안 그룹 연결
6. DB 마이그레이션
7. 앱 배포
8. Nginx/PM2 설정

### 코드 업데이트 배포

1. EC2 접속
2. 최신 코드 pull
3. `npm install`
4. `npm run build`
5. `pm2 restart seoulmate-be`

## 관련 문서

- [VPC_SETUP.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/VPC_SETUP.md)
- [AWS_SECURITY_GROUPS.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/AWS_SECURITY_GROUPS.md)
- [DB.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DB.md)
- [DOMAIN_SETUP.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DOMAIN_SETUP.md)
