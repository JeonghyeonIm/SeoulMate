# SeoulMate_BE AWS Security Groups

## 개요

이 문서는 `SeoulMate_BE`를 `EC2 + RDS PostgreSQL` 구조로 배포할 때 필요한 AWS 보안 그룹(Security Group) 생성 과정을 정리합니다.
기준은 `2026-05-06`이며, 가장 일반적이고 안전한 구성인 아래 구조를 전제로 합니다.

- 사용자 브라우저 -> EC2
- EC2 백엔드 -> RDS PostgreSQL

핵심 원칙은 단순합니다.

- EC2는 필요한 포트만 외부에 개방
- RDS는 인터넷 전체에 열지 않음
- RDS 5432 포트는 오직 EC2 보안 그룹에서만 접근 허용

## 목표 아키텍처

### 권장 연결 구조

```text
Internet
  -> EC2 Security Group
      - 80/443 allowed from public
      - 22 allowed only from my IP
  -> EC2 Instance
      -> RDS Security Group
          - 5432 allowed only from EC2 Security Group
      -> RDS PostgreSQL
```

## 준비물

- 같은 VPC 안의 EC2 인스턴스
- 같은 VPC 안의 RDS PostgreSQL 인스턴스
- AWS 콘솔 접근 권한
- 본인 공인 IP

## 보안 그룹 2개 만들기

권장 방식은 보안 그룹을 분리하는 것입니다.

- `seoulmate-ec2-sg`
- `seoulmate-rds-sg`

## 1. EC2 보안 그룹 생성

### AWS 콘솔 경로

`EC2 -> Security Groups -> Create security group`

### 기본 정보

- Security group name: `seoulmate-ec2-sg`
- Description: `Security group for SeoulMate EC2 backend`
- VPC: EC2와 RDS가 있는 같은 VPC 선택

### Inbound rules 권장값

#### 1. SSH

- Type: `SSH`
- Protocol: `TCP`
- Port range: `22`
- Source: `My IP`

설명:

- EC2 서버 접속용
- 절대 `0.0.0.0/0`로 열지 않는 것을 권장

#### 2. HTTP

- Type: `HTTP`
- Protocol: `TCP`
- Port range: `80`
- Source: `0.0.0.0/0`

설명:

- 웹 요청 허용
- 프론트 또는 외부 테스트용

#### 3. HTTPS

- Type: `HTTPS`
- Protocol: `TCP`
- Port range: `443`
- Source: `0.0.0.0/0`

설명:

- TLS 적용 시 필요

#### 4. 앱 직접 포트가 필요한 경우

예를 들어 Express를 `3000`에서 직접 받고 있고 Nginx 없이 테스트 중이면:

- Type: `Custom TCP`
- Port range: `3000`
- Source: `My IP` 또는 필요한 대역만

설명:

- 운영 환경에서는 보통 `3000`을 외부에 직접 열지 않고 Nginx 뒤에 둡니다.

### Outbound rules

- 기본값 `All traffic` 유지 가능

설명:

- EC2가 RDS, 외부 API, 패키지 저장소 등에 나가야 하므로 일반적으로 허용

## 2. RDS 보안 그룹 생성

### AWS 콘솔 경로

`RDS -> Databases -> 대상 DB 선택 -> Connectivity & security`

또는

`EC2/VPC -> Security Groups -> Create security group`

### 기본 정보

- Security group name: `seoulmate-rds-sg`
- Description: `Security group for SeoulMate RDS PostgreSQL`
- VPC: EC2와 같은 VPC 선택

### Inbound rules 권장값

#### PostgreSQL

- Type: `PostgreSQL`
- Protocol: `TCP`
- Port range: `5432`
- Source: `seoulmate-ec2-sg`

설명:

- CIDR로 여는 것보다 `EC2 보안 그룹`을 source로 지정하는 방식이 더 안전합니다.
- 이 설정은 `seoulmate-ec2-sg`가 붙은 인스턴스만 RDS에 접속 가능하게 만듭니다.

### Outbound rules

- 기본값 유지 가능

설명:

- 일반적인 RDS 사용에서는 outbound를 따로 건드리지 않아도 됩니다.

## 3. EC2에 보안 그룹 연결

### AWS 콘솔 경로

`EC2 -> Instances -> 대상 인스턴스 선택 -> Actions -> Security -> Change security groups`

### 설정

- `seoulmate-ec2-sg` 선택

## 4. RDS에 보안 그룹 연결

### AWS 콘솔 경로

`RDS -> Databases -> 대상 DB 선택 -> Modify`

### 설정

- Connectivity 섹션에서 VPC security group에 `seoulmate-rds-sg` 연결
- 필요 없는 기존 SG는 제거 검토

### 주의

- 수정 후 즉시 반영되지 않을 수 있음
- `Apply immediately` 여부 확인

## 5. 퍼블릭 접근 여부

### EC2

- 보통 퍼블릭 IP 또는 Elastic IP 사용 가능

### RDS

- 권장: `Public access = No`

설명:

- RDS는 EC2 내부 통신 전용으로 두는 것이 안전합니다.
- 로컬 PC에서 직접 붙어야 한다면 잠깐 `Public access = Yes`를 고려할 수 있지만, 운영 구조로는 비권장입니다.

## 6. 로컬에서 RDS 직접 접속이 필요한 경우

개발 중 pgAdmin이나 DBeaver로 직접 붙어야 한다면, `RDS SG`에 임시로 아래 규칙을 추가할 수 있습니다.

- Type: `PostgreSQL`
- Port: `5432`
- Source: `My IP`

주의:

- 작업 끝나면 제거하는 것을 권장
- 영구적으로 `0.0.0.0/0` 개방은 피해야 합니다.

## 추천 설정 요약

### EC2 SG Inbound

- `22` from `My IP`
- `80` from `0.0.0.0/0`
- `443` from `0.0.0.0/0`

### RDS SG Inbound

- `5432` from `seoulmate-ec2-sg`

## 흔한 실수

### 1. RDS 5432를 전체 공개

잘못된 예:

- Source: `0.0.0.0/0`

문제:

- DB가 인터넷에 직접 노출됩니다.

### 2. EC2와 RDS가 다른 VPC에 있음

문제:

- 보안 그룹을 잘 만들어도 연결이 안 될 수 있습니다.

### 3. RDS 보안 그룹에 EC2의 공인 IP를 넣으려 함

문제:

- 같은 VPC 안 통신은 보통 private IP 기반입니다.
- 가장 안전한 방식은 `EC2 보안 그룹 참조`입니다.

### 4. EC2 앱 포트를 열어두고 운영함

문제:

- `3000` 같은 앱 포트를 외부에 직접 열면 공격 표면이 커집니다.

권장:

- Nginx 또는 ALB 뒤로 숨기고 `80/443`만 공개

## 연결 확인 방법

### EC2에서 RDS 포트 확인

EC2 안에서:

```bash
nc -zv <rds-endpoint> 5432
```

또는

```bash
telnet <rds-endpoint> 5432
```

### PostgreSQL 접속 확인

```bash
psql -h <rds-endpoint> -U <db-user> -d <db-name> -p 5432
```

## 프로젝트 환경 변수 예시

```env
DATABASE_URL=
DATABASE_SSL=true
POSTGRES_HOST=seoulmate-db.xxxxx.ap-northeast-2.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DB=seoulmate
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
```

## 운영 권장 사항

- EC2와 RDS는 같은 VPC, 가능하면 같은 리전에 둡니다.
- RDS는 퍼블릭 접근을 끄고 private subnet 쪽에 두는 것이 좋습니다.
- SSH는 `My IP` 또는 Bastion host를 통해서만 허용합니다.
- 운영 환경에서는 EC2 앞단에 Nginx 또는 ALB를 두는 편이 안정적입니다.

## 관련 문서

- 구조 문서: [STRUCTURE.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/STRUCTURE.md)
- DB 설계: [DB.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DB.md)

## 참고 자료

- AWS EC2 Security Group 생성:
  - https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-security-group.html
- AWS EC2 Security Groups 개요:
  - https://docs.aws.amazon.com/us_en/AWSEC2/latest/UserGuide/ec2-security-groups.html
- AWS RDS Security Group 접근 제어:
  - https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.RDSSecurityGroups.html
