# SeoulMate_BE VPC Setup

## 개요

이 문서는 `SeoulMate_BE`를 `EC2 + RDS PostgreSQL` 구조로 배포하기 위해 AWS에서 `VPC`를 처음부터 구성하는 절차를 정리한 문서입니다.
기준은 `2026-05-06`이며, 수업/팀 프로젝트 수준에서 가장 설명하기 좋고 확장 가능한 기본 구조를 기준으로 작성했습니다.

목표 구조는 아래와 같습니다.

```text
VPC
├─ Public Subnet
│  └─ EC2
└─ Private Subnets
   └─ RDS PostgreSQL
```

핵심 원칙:

- EC2는 외부 요청을 받기 위해 public subnet에 둠
- RDS는 외부에 직접 노출하지 않고 private subnet에 둠
- EC2와 RDS는 같은 VPC 안에서 통신

## 최종 구성 목표

### 네트워크 구성

- VPC 1개
- Public subnet 1개
- Private subnet 2개
- Internet Gateway 1개
- Route Table 2개
  - Public route table
  - Private route table

### 컴퓨팅/DB 구성

- EC2 1개
- RDS PostgreSQL 1개

### 보안 구성

- EC2용 Security Group 1개
- RDS용 Security Group 1개

## 전체 순서 요약

1. VPC 생성
2. Public subnet 생성
3. Private subnet 2개 생성
4. Internet Gateway 생성 후 VPC에 연결
5. Route Table 생성 및 연결
6. Public subnet의 자동 공인 IP 설정 확인
7. RDS용 DB subnet group 구성
8. Security Group 생성
9. EC2 생성
10. EIP 할당 및 EC2 연결
11. RDS 생성
12. EC2 -> RDS 연결 확인

## 1. VPC 생성

### AWS 콘솔 경로

`VPC -> Your VPCs -> Create VPC`

### 권장 설정

- Name tag: `seoulmate-vpc`
- IPv4 CIDR block: `10.0.0.0/16`
- IPv6 CIDR: 사용 안 해도 됨
- Tenancy: `Default`

### 설명

- `10.0.0.0/16`은 내부적으로 사용할 넉넉한 주소 대역입니다.
- 수업/팀 프로젝트 기준으로 무난한 선택입니다.

## 2. Public Subnet 생성

### AWS 콘솔 경로

`VPC -> Subnets -> Create subnet`

### 권장 설정

- VPC: `seoulmate-vpc`
- Subnet name: `seoulmate-public-subnet-a`
- Availability Zone: 예) `ap-northeast-2a`
- IPv4 subnet CIDR block: `10.0.1.0/24`

### 설명

- 이 서브넷에는 EC2를 올립니다.
- 외부 인터넷과 통신 가능한 구간입니다.

## 3. Private Subnet 2개 생성

RDS는 일반적으로 서로 다른 AZ에 있는 최소 2개의 subnet을 요구합니다.

### Private Subnet A

- VPC: `seoulmate-vpc`
- Subnet name: `seoulmate-private-subnet-a`
- AZ: `ap-northeast-2a`
- CIDR: `10.0.2.0/24`

### Private Subnet B

- VPC: `seoulmate-vpc`
- Subnet name: `seoulmate-private-subnet-b`
- AZ: `ap-northeast-2c`
- CIDR: `10.0.3.0/24`

### 설명

- RDS는 private subnet에 배치합니다.
- 서로 다른 AZ에 private subnet 2개를 두면 RDS subnet group을 만들 수 있습니다.

## 4. Internet Gateway 생성 및 연결

### AWS 콘솔 경로

`VPC -> Internet Gateways -> Create internet gateway`

### 권장 설정

- Name tag: `seoulmate-igw`

생성 후:

- `Actions -> Attach to VPC`
- 대상 VPC: `seoulmate-vpc`

### 설명

- Internet Gateway가 있어야 public subnet의 리소스가 외부 인터넷과 통신할 수 있습니다.

## 5. Route Table 생성

## 5-1. Public Route Table 생성

### AWS 콘솔 경로

`VPC -> Route Tables -> Create route table`

### 권장 설정

- Name: `seoulmate-public-rt`
- VPC: `seoulmate-vpc`

### 라우트 추가

- Destination: `0.0.0.0/0`
- Target: `seoulmate-igw`

### 서브넷 연결

- `seoulmate-public-subnet-a` 연결

### 설명

- public subnet이 인터넷으로 나갈 수 있도록 하는 설정입니다.

## 5-2. Private Route Table 생성

### 권장 설정

- Name: `seoulmate-private-rt`
- VPC: `seoulmate-vpc`

### 서브넷 연결

- `seoulmate-private-subnet-a`
- `seoulmate-private-subnet-b`

### 설명

- private subnet은 인터넷에 직접 나갈 필요가 없으므로 기본 route만 두어도 됩니다.
- 초기 실습 단계에서는 NAT Gateway 없이도 충분합니다.

## 6. Public Subnet의 자동 공인 IP 설정

### AWS 콘솔 경로

`VPC -> Subnets -> public subnet 선택 -> Actions -> Edit subnet settings`

### 설정

- `Enable auto-assign public IPv4 address` 체크

### 설명

- EC2를 만들 때 퍼블릭 IP를 자동으로 받게 하려면 이 설정이 편합니다.

## 7. RDS용 DB Subnet Group 생성

RDS는 subnet 2개 이상을 묶은 DB subnet group이 필요합니다.

### AWS 콘솔 경로

`RDS -> Subnet groups -> Create DB subnet group`

### 권장 설정

- Name: `seoulmate-db-subnet-group`
- Description: `DB subnet group for SeoulMate RDS`
- VPC: `seoulmate-vpc`
- Add subnets:
  - `seoulmate-private-subnet-a`
  - `seoulmate-private-subnet-b`

### 설명

- RDS를 private 영역에 둘 수 있게 해주는 구성입니다.

## 8. Security Group 생성

이 단계는 상세 문서가 따로 있습니다.

- [AWS_SECURITY_GROUPS.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/AWS_SECURITY_GROUPS.md)

권장 보안 그룹:

- `seoulmate-ec2-sg`
- `seoulmate-rds-sg`

핵심 규칙:

- EC2 inbound:
  - `22` from `My IP`
  - `80` from `0.0.0.0/0`
  - `443` from `0.0.0.0/0`
- RDS inbound:
  - `5432` from `seoulmate-ec2-sg`

## 9. EC2 생성

### AWS 콘솔 경로

`EC2 -> Instances -> Launch instances`

### 권장 설정

- Name: `seoulmate-ec2`
- AMI: Amazon Linux 또는 Ubuntu
- Instance type: 프리티어 범위 인스턴스
- VPC: `seoulmate-vpc`
- Subnet: `seoulmate-public-subnet-a`
- Auto-assign Public IP: `Enable`
- Security group: `seoulmate-ec2-sg`
- Key pair: 새로 생성하거나 기존 것 사용

### 설명

- 이 인스턴스에서 백엔드 서버를 실행합니다.

## 10. RDS PostgreSQL 생성

### AWS 콘솔 경로

`RDS -> Databases -> Create database`

### 권장 설정

- Engine: `PostgreSQL`
- Template: 프리티어/개발용 선택
- DB instance identifier: `seoulmate-db`
- Master username: 예) `postgres`
- Password: 직접 설정
- VPC: `seoulmate-vpc`
- DB subnet group: `seoulmate-db-subnet-group`
- Public access: `No`
- Security group: `seoulmate-rds-sg`
- Database name: `seoulmate`

### 설명

- RDS는 private subnet 내부에 두고 EC2에서만 접근하도록 구성합니다.

## 11. EIP 할당 및 EC2 연결

외부에서 안정적으로 접속하려면 EC2에 Elastic IP를 붙이는 것이 좋습니다.

### AWS 콘솔 경로

`EC2 -> Elastic IPs`

### 절차

1. `Allocate Elastic IP address`
2. 생성된 EIP 선택
3. `Associate Elastic IP address`
4. 대상 인스턴스: `seoulmate-ec2`

### 설명

- EC2 퍼블릭 IP는 바뀔 수 있지만, EIP는 고정 공인 IP입니다.
- 도메인 연결, 발표 환경, SSH 접속 관리에 유리합니다.
- EIP는 사용하지 않고 놀리면 과금될 수 있습니다.

## 12. EC2에서 RDS 연결 확인

### `.env` 예시

```env
DATABASE_URL=
DATABASE_SSL=true
POSTGRES_HOST=seoulmate-db.xxxxx.ap-northeast-2.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DB=seoulmate
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
```

### 포트 확인

EC2 접속 후:

```bash
nc -zv <rds-endpoint> 5432
```

### PostgreSQL 접속 확인

```bash
psql -h <rds-endpoint> -U <db-user> -d <db-name> -p 5432
```

## 12. 테이블 생성

RDS를 만들었다고 테이블이 자동 생성되지는 않습니다.
아래 SQL을 직접 실행해야 합니다.

- 마이그레이션:
  - [20260506_initial_schema.sql](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/db/migrations/20260506_initial_schema.sql)
- 시드 데이터:
  - [seed.sql](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/db/seed.sql)

## 추천 네이밍 예시

- VPC: `seoulmate-vpc`
- Public subnet: `seoulmate-public-subnet-a`
- Private subnet A: `seoulmate-private-subnet-a`
- Private subnet B: `seoulmate-private-subnet-b`
- Internet Gateway: `seoulmate-igw`
- Public Route Table: `seoulmate-public-rt`
- Private Route Table: `seoulmate-private-rt`
- EC2 SG: `seoulmate-ec2-sg`
- RDS SG: `seoulmate-rds-sg`
- RDS subnet group: `seoulmate-db-subnet-group`
- EC2: `seoulmate-ec2`
- RDS: `seoulmate-db`

## 흔한 실수

### 1. RDS를 public subnet처럼 다루기

- RDS는 가능하면 private subnet에 둬야 합니다.

### 2. Private subnet을 1개만 만듦

- RDS subnet group 생성 시 막히는 경우가 많습니다.

### 3. EC2와 RDS가 다른 VPC에 있음

- 연결 설정이 훨씬 복잡해집니다.

### 4. RDS 5432를 `0.0.0.0/0`로 개방

- 보안상 좋지 않습니다.

### 5. Route Table 연결 누락

- subnet은 만들었는데 인터넷이 안 되는 경우 대부분 이 문제입니다.

## 빠른 대안

시간이 부족하면 새 VPC를 만들지 않고 `default VPC`를 써도 됩니다.
다만 발표나 구조 설명까지 고려하면 이 문서 구조대로 새 VPC를 만드는 편이 더 좋습니다.

## 관련 문서

- 보안 그룹 문서: [AWS_SECURITY_GROUPS.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/AWS_SECURITY_GROUPS.md)
- DB 설계 문서: [DB.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DB.md)
- 실제 배포 절차: [DEPLOYMENT.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DEPLOYMENT.md)
- 구조 문서: [STRUCTURE.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/STRUCTURE.md)
