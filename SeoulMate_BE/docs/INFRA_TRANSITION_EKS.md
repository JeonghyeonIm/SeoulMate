# SeoulMate_BE 인프라 전환 가이드

## 개요

이 문서는 현재 `SeoulMate_BE`의 `EC2 + Nginx + PM2 + RDS` 배포 구조를 기준으로, 향후 `EKS + ALB + 오토스케일링 + 무중단 배포 + CI/CD` 체계로 전환하기 위한 전체 로드맵을 정리한 문서다.

현재 리포지토리 기준 애플리케이션 특성은 다음과 같다.

- 런타임: `Node.js + Express`
- 빌드 결과물: `dist/server.js`
- 헬스체크 엔드포인트: `GET /health`
- 데이터베이스: `PostgreSQL`
- 배치성 실행 경로 존재:
  - `dist/jobs/runPublicDataSync.js`
  - `dist/jobs/runCoordinateConversion.js`

이 문서의 목표는 단순히 "쿠버네티스로 옮긴다"가 아니라, 아래 항목을 운영 기준으로 확보하는 것이다.

- 단일 서버 의존성 제거
- 트래픽 증가에 따른 수평 확장
- 자동화된 배포
- 롤백 가능한 릴리스 체계
- 무중단 배포
- DNS, 인증서, 인그레스, 시크릿 관리 체계화

## 현재 구조

현재 구조는 대략 아래와 같다.

```text
사용자
  -> 가비아 DNS
  -> EC2 EIP
  -> Nginx
  -> PM2로 실행 중인 Node.js
  -> RDS PostgreSQL
```

현재 구조의 장점:

- 초기 구축이 빠르다
- 이해하기 쉽다
- 비용을 낮게 시작할 수 있다

현재 구조의 한계:

- EC2 한 대가 장애 지점이다
- 배포가 수동 절차에 의존한다
- 프로세스 재시작 시 순간 단절이 생길 수 있다
- 스케일아웃이 수동이다
- API 런타임과 배치성 작업의 경계가 흐려지기 쉽다

## 목표 구조

권장 목표 구조는 아래와 같다.

```text
사용자
  -> Route 53
  -> ALB
  -> EKS Ingress
  -> Backend Pod
  -> RDS PostgreSQL

GitHub
  -> GitHub Actions
  -> 빌드 / 검증 / 이미지 푸시
  -> 배포 매니페스트 갱신
  -> Argo CD 동기화
  -> EKS 롤링 배포

클러스터 부가 구성요소
  -> AWS Load Balancer Controller
  -> ExternalDNS
  -> cert-manager
  -> HPA
  -> Karpenter 또는 Cluster Autoscaler
```

AWS 서비스 매핑 기준:

- `EKS`: 애플리케이션 오케스트레이션
- `ECR`: 컨테이너 이미지 저장소
- `ALB`: HTTP/HTTPS 트래픽 분산
- `RDS PostgreSQL`: 관리형 데이터베이스
- `Route 53`: DNS 및 AWS 리소스 연계
- `CloudWatch`: 로그 및 메트릭
- `Secrets Manager` 또는 `SSM Parameter Store`: 시크릿 및 설정 관리

## 왜 이 전환이 필요한가

SeoulMate가 계속 운영되면 아래 요구가 자연스럽게 생긴다.

- 배포 횟수 증가
- 동시에 여러 사용자가 요청
- 장애 시 복구 속도 요구
- 개발 / 스테이징 / 운영 환경 분리
- 작업 재현성과 문서화
- 사람이 직접 SSH 접속해서 배포하는 방식의 한계

즉, 이 전환은 기술 유행 대응이 아니라 운영 리스크 축소를 위한 전환이다.

## 핵심 의사결정

SeoulMate 기준으로 권장하는 방향은 다음과 같다.

1. 데이터베이스는 계속 `RDS PostgreSQL` 사용
2. 백엔드는 컨테이너 이미지로 표준화
3. 런타임은 `EC2 + PM2`에서 `EKS`로 이동
4. 외부 진입점은 `ALB`
5. `api.seoulmate.my`는 `Ingress` 기준으로 운영
6. DNS 자동화가 필요한 시점에 `Route 53`으로 권한 DNS 전환
7. CI는 `GitHub Actions`
8. CD는 `Argo CD`

이 구조의 역할 분리는 명확하다.

- CI: 코드 검증, 이미지 생성, 아티팩트 표준화
- CD: 선언된 상태를 클러스터에 반영
- Kubernetes: 배포와 복제 상태 유지
- AWS: 로드밸런싱, 네트워크, 스케일링 기반 제공

## 단계별 전환 전략

한 번에 전환하면 위험하다. 아래 순서로 나누는 것이 맞다.

### 1단계. 애플리케이션 동작 표준화

인프라를 옮기기 전에 먼저 애플리케이션이 "배포 가능한 상태"여야 한다.

필수 항목:

- `GET /health` 유지
- `GET /ready` 추가
- 필수 환경변수 누락 시 빠르게 실패
- `SIGTERM` 수신 시 graceful shutdown 처리
- API 서버와 배치 실행 경로를 운영 개념상 분리
- 런타임 환경변수 목록 문서화

권장 의미:

```text
/health -> 프로세스 생존 확인
/ready  -> 실제로 트래픽을 받아도 되는 상태 확인
```

`/health`만 있고 `/ready`가 없으면 쿠버네티스가 아직 준비 안 된 Pod에도 트래픽을 보낼 수 있다.

### 2단계. 컨테이너 이미지 표준화

EKS 이전에 반드시 `Dockerfile` 기준 실행이 가능해야 한다.

권장 원칙:

- `Node.js 20 LTS` 기반 이미지 사용
- 멀티 스테이지 빌드 사용
- 최종 런타임 이미지에는 개발 의존성 제외
- 비루트 사용자로 실행
- `CMD ["node", "dist/server.js"]` 형태로 명시

권장 빌드 흐름:

```text
build stage
  -> npm ci
  -> npm run build

runtime stage
  -> dist 복사
  -> package.json 복사
  -> npm ci --omit=dev
  -> node dist/server.js 실행
```

최종 이미지에 넣지 말아야 할 것:

- 로컬 `.env`
- 개발용 캐시 파일
- 테스트 전용 자산
- 빌드 전용 도구

### 3단계. 인스턴스 프록시 구조 제거

현재는 EC2 안에서 `Nginx -> Node.js` 구조지만, EKS로 가면 인스턴스 수준 리버스 프록시는 기본 운영 단위가 아니다.

대신 아래 리소스로 바뀐다.

- `Deployment`: Pod 복제 및 롤링 배포
- `Service`: 클러스터 내부 노출
- `Ingress`: 외부 HTTP/HTTPS 진입점
- `AWS Load Balancer Controller`: Ingress를 ALB로 연결

결과 구조:

```text
api.seoulmate.my
  -> Route 53
  -> ALB
  -> Ingress
  -> Service
  -> Pod
```

### 4단계. 오토스케일링 도입

오토스케일링은 두 층으로 봐야 한다.

- `HPA`: Pod 수를 조절
- `Karpenter` 또는 `Cluster Autoscaler`: Node 수를 조절

초기 권장 설정:

- 최소 replica: `2`
- 최대 replica: `6` 또는 `10`
- CPU / 메모리 기준 HPA 먼저 적용

이 단계에서 중요한 전제:

- 각 컨테이너에 `requests` / `limits`가 있어야 함
- readiness probe가 정확해야 함
- startup 시간이 대략 정리되어 있어야 함
- DB 커넥션 풀 크기가 무한정 커지지 않도록 통제되어야 함

### 5단계. 배포 자동화 도입

배포 자동화는 CI와 CD를 분리해서 봐야 한다.

CI 역할:

- 의존성 설치
- lint
- build
- test
- Docker image build
- ECR push

CD 역할:

- 배포 매니페스트 변경 감지
- 클러스터와 desired state 동기화
- 롤링 업데이트 수행
- 실패 시 이전 상태로 되돌릴 수 있는 기반 제공

## 네트워크와 DNS 설계

### 권장 네트워크 배치

최소 권장:

- 서로 다른 AZ에 `public subnet 2개`
- 서로 다른 AZ에 `private subnet 2개`

배치 원칙:

- `ALB`: public subnet
- `EKS worker node`: private subnet
- `RDS`: private subnet

트래픽 흐름:

```text
인터넷
  -> Public ALB
  -> Private EKS Node
  -> Private RDS
```

### DNS 전략

실무적으로는 아래처럼 가져가는 것이 자연스럽다.

- 도메인 등록기관: 계속 `가비아` 가능
- 권한 DNS: 나중에 `Route 53`으로 이동 권장

Route 53이 필요한 이유:

- ALB에 `Alias` 연결 가능
- `ExternalDNS`와 연동 가능
- 환경별 레코드 관리가 쉬움
- 나중에 weighted / failover / latency routing 확장 가능

권장 최종 구조:

- 등록기관: `가비아`
- 네임서버 위임: `Route 53`
- 레코드: `api.seoulmate.my -> ALB alias`

## Kubernetes 리소스 설계

권장 네임스페이스 예시:

- `seoulmate-staging`
- `seoulmate-prod`

애플리케이션 기본 리소스:

- `Namespace`
- `Deployment`
- `Service`
- `Ingress`
- `ConfigMap`
- `Secret`
- `HorizontalPodAutoscaler`
- `PodDisruptionBudget`

운영 배포 기준 권장값:

- replica 최소 `2`
- 전략: `RollingUpdate`
- `maxUnavailable: 0`
- `maxSurge: 1`

의미:

```text
현재 Pod 2개
새 버전 배포
  -> 새 Pod 1개 생성
  -> readiness 확인
  -> 기존 Pod 1개 종료
  -> 반복
```

이 구조가 무중단 배포의 가장 기본 형태다.

## 무중단 배포 설계

무중단 배포는 쿠버네티스만 쓰면 자동으로 되는 것이 아니다. 애플리케이션 종료 처리, readiness, DB 변경 방식, replica 수가 다 같이 맞아야 한다.

### 무중단 배포 성립 조건

- 운영 replica 최소 `2`
- readiness probe 정확함
- `SIGTERM` graceful shutdown 구현
- DB 마이그레이션이 하위 호환됨
- `maxUnavailable: 0`
- ALB health check와 앱 readiness 기준이 일치함

### 애플리케이션 종료 동작

Pod 종료 시 애플리케이션은 아래 순서로 움직여야 한다.

1. `SIGTERM` 수신
2. 신규 요청 수락 중단
3. 진행 중 요청 마무리
4. DB pool 정리
5. 프로세스 종료

이게 없으면 롤링 배포 중 트래픽이 끊길 수 있다.

### Probe 전략

권장 기준:

- liveness probe -> `/health`
- readiness probe -> `/ready`
- startup probe -> 부팅이 느려지면 추가

의미:

- liveness 실패: 재시작 대상
- readiness 실패: 트래픽 제외 대상

### PodDisruptionBudget

노드 정비나 축출 상황에서도 Pod가 한 번에 다 빠지지 않도록 `PodDisruptionBudget`을 둬야 한다.

초기 권장:

- `minAvailable: 1`

replica가 늘면:

- `replicas >= 3`일 때 `minAvailable: 2` 검토 가능

## 배포 전략 비교

### 1. Rolling Update

가장 먼저 도입할 기본 전략이다.

장점:

- 단순하다
- 쿠버네티스 기본 기능으로 충분하다
- 대부분의 API 서비스에 적합하다

단점:

- 구버전과 신버전이 잠시 공존한다
- DB 스키마 호환성이 필수다

### 2. Blue/Green

릴리스 리스크가 커지고 빠른 되돌리기가 아주 중요할 때 고려한다.

장점:

- 전환 전 검증이 쉽다
- 되돌리기가 빠르다

단점:

- 인프라 비용이 더 든다
- 운영 복잡도가 올라간다

### 3. Canary

트래픽이 충분히 많고 관측 지표가 잘 갖춰졌을 때 의미가 있다.

장점:

- 장애 범위를 줄일 수 있다
- 점진적 노출이 가능하다

단점:

- 관측 체계가 약하면 운영이 어렵다
- `Argo Rollouts` 같은 추가 구성이 필요할 수 있다

권장 결론:

- SeoulMate는 우선 `Rolling Update`부터 도입
- 이후 트래픽과 릴리스 빈도가 커지면 `Blue/Green` 또는 `Canary` 검토

## 데이터베이스 마이그레이션 전략

무중단 배포에서 실제로 가장 위험한 부분은 DB 변경이다.

원칙:

- 앱 배포 중 구버전과 신버전이 동시에 살아도 스키마가 깨지지 않아야 한다

안전한 패턴:

1. 하위 호환 가능한 스키마 먼저 추가
2. 구버전 / 신버전 모두 동작 가능한 앱 배포
3. 필요 시 데이터 백필
4. 새 구조 완전 전환
5. 구 구조 제거는 나중에 별도 수행

비교적 안전한 변경:

- nullable 컬럼 추가
- 새 테이블 추가
- 인덱스 추가

위험한 변경:

- 사용 중인 컬럼 즉시 rename
- 사용 중인 컬럼 즉시 drop
- 런타임과 동시에 의미가 바뀌는 데이터 변경

마이그레이션 실행 방식 후보:

1. CI/CD 파이프라인에서 앱 배포 전 실행
2. Kubernetes `Job`으로 실행
3. 운영 승인 단계에서 수동 실행

현재 성숙도 기준 권장:

- 운영 환경은 당분간 승인 단계를 둔 별도 migration step 권장

## API와 배치 작업 분리

현재 리포지토리에는 배치성 실행 경로가 이미 존재한다.

- `runPublicDataSync`
- `runCoordinateConversion`

이 작업들을 장기적으로 API 서버 안에 묶어두면 운영이 꼬인다.

권장 목표:

- API 서버: `Deployment`
- 주기적 동기화: `CronJob`
- 일회성 작업: `Job`

이렇게 분리하면:

- API 확장과 배치 확장을 따로 제어 가능
- 장애 범위를 분리 가능
- 배포 시 영향 범위가 명확해짐

## 시크릿과 환경변수 관리

운영 시크릿은 git에 직접 들어가면 안 된다.

권장 저장소:

- `AWS Secrets Manager`: 비밀값
- `SSM Parameter Store`: 일반 설정값

분리 예시:

시크릿:

- `POSTGRES_PASSWORD`
- 외부 API Key
- 토큰류

일반 설정:

- `PORT`
- 로그 레벨
- 도메인명
- 기능 플래그

쿠버네티스 반영 방식은 아래 중 하나를 선택한다.

- External Secrets 계열 연동
- CSI Secret Store 연동
- 통제된 Kubernetes Secret 동기화

## 관측성과 운영

오토스케일링과 무중단 배포는 관측성이 없으면 위험하다.

최소 운영 관측 항목:

- 애플리케이션 로그
- ALB 요청 로그 또는 동등한 요청 가시성
- CPU / 메모리 사용량
- 응답 지연 시간
- HTTP 4xx / 5xx 비율
- Pod 재시작 횟수
- 배포 이벤트
- DB 연결 수와 부하

권장 운영 스택:

- `CloudWatch Logs`
- `CloudWatch Container Insights`
- 필요 시 `Prometheus + Grafana`

권장 알람:

- 5xx 비율 급증
- 지연 시간 지속 증가
- HPA가 상한에 장시간 걸림
- Pod CrashLoop
- RDS CPU 또는 connection saturation

## 보안 기준선

최소 권장 보안 기준:

- Worker node는 private subnet
- IAM Role for Service Account 최소 권한
- ECR 이미지 취약점 스캔
- `main` 브랜치 보호
- 운영 배포 approval
- 필요 시 ALB 앞단 WAF 적용

## CI/CD 구조

권장 흐름:

```text
개발자 push
  -> GitHub Actions CI
  -> lint / build / test
  -> Docker image build
  -> ECR push
  -> 배포 매니페스트 변경
  -> Argo CD sync
  -> EKS rolling update
```

### 브랜치 운영 권장

단순한 형태로는 아래면 충분하다.

- `main`: 배포 가능한 브랜치
- feature branch: 개발 브랜치

환경을 더 나누면:

- `staging`
- `production`

### CI 단계 권장안

권장 순서:

1. checkout
2. `npm ci`
3. `npm run lint`
4. `npm run build`
5. test
6. Docker image build
7. commit SHA 기준 태그 부여
8. ECR push
9. CD 입력값 갱신

현재 리포지토리 주의점:

`package.json`에는 `lint`, `build`, `format:check`는 있지만 기본 `test` script가 없다. 운영용 CI를 안정적으로 만들려면 먼저 `npm test` 또는 이에 준하는 고정 테스트 진입점을 정의하는 것이 맞다.

현재 기준 최소 CI 명령 예시:

```bash
npm ci
npm run lint
npm run build
npm run format:check
```

## CD 구조

권장 방식은 GitOps다.

권장 분리:

- 애플리케이션 소스 저장소: 코드, Dockerfile, 앱 문서
- 배포 저장소 또는 배포 디렉터리: Helm values, Kustomize, raw YAML

권장 도구:

- `Argo CD`

이유:

- 클러스터가 pull 방식으로 desired state를 가져가는 구조가 더 안전하다
- 현재 배포 상태와 drift 확인이 쉽다
- 롤백 경로가 비교적 명확하다

## 환경 승격 방식

최소 2개 환경 권장:

- `staging`
- `production`

권장 승격 흐름:

1. `main` 머지
2. commit SHA 기준 immutable image 생성
3. `staging` 배포
4. smoke test
5. 운영 승인
6. 동일한 image digest를 `production`에 반영

중요 원칙:

- 운영 배포 때 이미지를 다시 빌드하지 않는다
- 검증된 동일 아티팩트를 승격한다

## End-to-End 배포 흐름

### 1. 개발자 머지

코드가 `main`에 머지된다.

### 2. CI 검증

GitHub Actions가 아래를 수행한다.

- `npm ci`
- `npm run lint`
- `npm run build`
- test
- container build

실패하면 릴리스 중단이다.

### 3. 이미지 발행

CI가 이미지를 `ECR`에 push 한다.

태그 예시:

- `seoulmate-be:git-<short-sha>`
- 필요 시 `v1.4.0` 같은 릴리스 태그 병행

### 4. 배포 매니페스트 갱신

새 이미지 태그 또는 digest가 배포 입력값에 반영된다.

형태 예시:

- Helm values 수정
- Kustomize image update
- raw YAML image 필드 수정

### 5. Argo CD 동기화

Argo CD가 desired state 변화를 감지하고 EKS에 반영한다.

### 6. 롤링 배포

쿠버네티스가 아래 순서로 동작한다.

- 새 Pod 생성
- readiness 확인
- Service endpoint 편입
- ALB 트래픽 연결
- 기존 Pod 제거

### 7. Smoke 검증

자동 또는 수동으로 아래 확인:

- `GET /health`
- `GET /ready`
- 핵심 API 1개 이상 호출

### 8. 모니터링 구간

배포 직후 아래 지표 집중 확인:

- 에러율
- 지연 시간
- Pod restart
- DB 메트릭

### 9. 필요 시 롤백

롤백 후보:

- Argo CD에서 이전 revision으로 복귀
- Kubernetes rollout undo

## 롤백 전략

무중단 배포 체계에는 반드시 롤백 경로가 있어야 한다.

권장 롤백 층위:

1. 애플리케이션 버전 롤백
2. 매니페스트 롤백
3. DB는 전면 rollback보다 forward-fix 전략 우선

DB는 완전한 되돌리기가 항상 안전하지 않다. 그래서 실무적으로는 아래가 더 중요하다.

- 스키마를 하위 호환으로 유지
- 앱만 먼저 되돌릴 수 있게 설계
- 스키마는 이후 별도로 정리

## SeoulMate 기준 실전 권장 스택

현 시점 기준 가장 현실적인 조합은 아래다.

- `EKS`
- `ECR`
- `AWS Load Balancer Controller`
- `ExternalDNS`
- `Route 53`
- `cert-manager`
- `Karpenter`
- `GitHub Actions`
- `Argo CD`
- `CloudWatch`

이 정도면 충분히 강한 운영 체계를 만들 수 있고, 처음부터 서비스 메시까지 올릴 필요는 없다.

## 리포지토리에 나중에 추가될 가능성이 높은 항목

이 문서는 설계 문서이므로, 실제 운영화를 위해서는 아래 파일과 디렉터리가 뒤따를 가능성이 높다.

- `Dockerfile`
- `.dockerignore`
- `.github/workflows/ci.yml`
- `.github/workflows/release-image.yml`
- `deploy/base` 또는 `helm/`
- `Deployment`, `Service`, `Ingress`, `HPA`, `PDB` 매니페스트
- migration 실행용 script 또는 Job 정의

## 실제 전환 순서 권장안

권장 순서:

1. `/ready` 추가
2. graceful shutdown 추가
3. Docker image 생성
4. ECR 준비
5. EKS 기본 클러스터 구성
6. `AWS Load Balancer Controller` 설치
7. `staging` 배포
8. ALB ingress와 RDS 연결 검증
9. HPA 추가
10. `Karpenter` 또는 `Cluster Autoscaler` 추가
11. `Route 53 + ExternalDNS` 추가
12. `cert-manager` 또는 인증서 체계 추가
13. `Argo CD` 추가
14. 운영 승인 배포 흐름 추가
15. `api.seoulmate.my`를 EC2에서 ALB로 절체
16. 짧은 기간 기존 EC2를 fallback으로 유지
17. PM2 기반 운영 경로 종료

## EC2에서 EKS로 절체하는 실제 운영 절차

운영 절체는 아래처럼 가져가는 것이 안전하다.

1. 기존 EC2 운영 서비스 유지
2. 동일 버전을 EKS `staging`에 먼저 배포
3. DB 호환성 검증
4. 운영용 ALB와 Ingress 준비
5. DNS TTL을 사전에 낮춤
6. `api.seoulmate.my`를 운영 ALB로 변경
7. 에러율과 지연 시간 집중 모니터링
8. 문제 시 기존 EC2로 빠르게 복귀 가능하게 유지
9. 안정화 확인 후 EC2 종료

## 자주 실패하는 지점

### 1. readiness probe가 너무 낙관적임

결과:

- 아직 준비 안 된 Pod에 ALB가 트래픽 전달

### 2. 운영 replica가 1개뿐임

결과:

- 롤링 배포나 노드 정비 중 단절 발생

### 3. DB 스키마가 하위 호환이 아님

결과:

- 배포 중 구버전과 신버전이 서로 깨뜨림

### 4. HPA를 붙였는데 requests가 없음

결과:

- 스케일링 판단이 불안정해짐

### 5. CD에서 `latest` 같은 mutable tag 사용

결과:

- 어떤 버전이 배포됐는지 추적 어려움

### 6. 배치 작업을 계속 API 서버에 묶어둠

결과:

- 스케일아웃 시 작업 중복 또는 운영 복잡도 증가

## 최종 권장 결론

SeoulMate 기준 권장 방향은 아래다.

- 단기: 현재 EC2 운영 안정화
- 중기: 컨테이너 표준화 후 EKS 이전
- 운영 배포 기본형: `Rolling Update + replica 2개 이상 + readiness probe + ALB + Route 53`
- 배포 자동화 기본형: `GitHub Actions + Argo CD + immutable image tag`
- 확장 기본형: `HPA + Karpenter`

처음부터 가장 복잡한 구조로 갈 필요는 없다. 먼저 안정적인 기본형을 만들고, 이후 트래픽과 운영 난이도가 올라갈 때 `Blue/Green`이나 `Canary`로 확장하는 것이 맞다.

## 관련 문서

- [DEPLOYMENT.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DEPLOYMENT.md)
- [DOMAIN_SETUP.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DOMAIN_SETUP.md)
- [DOMAIN_AND_SERVER_BINDING.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/DOMAIN_AND_SERVER_BINDING.md)
- [VPC_SETUP.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/VPC_SETUP.md)
- [AWS_SECURITY_GROUPS.md](/abs/C:/Users/DGSO1/SeoulMate/SeoulMate_BE/docs/AWS_SECURITY_GROUPS.md)
