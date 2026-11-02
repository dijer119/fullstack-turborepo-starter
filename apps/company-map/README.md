# Company Map

산업·기업 N:M 매핑 시각화 본인용 도구. Prisma + SQLite 단일 파일 DB로 동작 (외부 의존성 0).

## Setup

1. `cp .env.example .env.local` (DATABASE_URL이 들어가 있음 — 그대로 사용 가능)
2. 첫 실행 시 마이그레이션:
   ```
   yarn workspace company-map prisma migrate dev
   yarn workspace company-map prisma generate
   ```
   → `apps/company-map/data/company-map.db` 자동 생성됨
3. 개발 서버:
   ```
   yarn workspace company-map dev
   ```
   포트 3004
4. `/import` 페이지에서 KRX CSV 업로드 → `/industries`에서 트리 작성 → `/`에서 시각화

## 워커 실행

`yarn workspace company-map worker`로 실행합니다. 동일 PC에서는 워커 하나만 실행되며 `worker:once`와 다른 체크아웃도 같은 잠금(`127.0.0.1:13004`)을 사용합니다. 이미 실행 중이면 추가 프로세스는 데이터 수집·토스 API 호출 전에 오류와 함께 종료됩니다. 잠금은 프로세스 종료 시 운영체제가 자동 해제하므로 잠금 파일을 지울 필요가 없습니다. 다른 프로그램이 이 포트를 점유한 경우에도 실행을 중단합니다.

## 구조

- 데이터: SQLite 단일 파일 — `industries`(self-tree), `companies`, `company_industries`(N:M)
- ORM: Prisma (`prisma/schema.prisma` 단일 source of truth, type 자동 생성)
- 시각화: React Flow + d3-force, 양방향(산업↔기업) 자유 탐색

## 기능

- **분할매매** (`/stocks/split`) — 별도 모의·실거래 차수 장부를 제공합니다. 모의는 직접 입력 가격 경로(최대 200개) 또는 토스 시세로 화면에서 실행합니다. 실거래는 고정 토스 계좌의 국내·미국 정수주를 정규장에, 국내 NXT 지원·거래 가능 종목은 애프터마켓 접속매매 시간에도 30초 주기로 감시하고 지정가 DAY 주문을 제출하며, 실제 부분 체결·비용으로 정산합니다. 실거래 전략은 정지 상태로 생성되고 사용자가 시작해야 합니다. 전량 익절 정산 후 다음 감시에 동일한 설정으로 1차를 자동 재매수하며, 차수당 예산과 기존 장부·누적 수익금은 유지합니다. 일시정지는 신규 주문만 멈추며 미체결 취소·정정은 토스 앱에서 처리합니다. `SPLIT_LIVE_DISABLED=1`은 신규 실주문을 차단하지만 체결 동기화는 계속합니다. 모의 기록을 LIVE로 전환하지 않습니다. 새 migration 적용과 앱 Prisma generate 후 worker를 실행해야 합니다. 모의는 토스 설정 없이 사용할 수 있습니다.
- **QQQ·QLD 적립식** (`/stocks/dca`) — 기준 종목이 직전 최고 종가 대비 임계% 이상 하락한 거래일에는 레버리지 종목을, 그 외에는 기준 종목을 매 거래일 이월 잔액 전액으로 금액 기반(`orderAmount`) 시장가 매수(소수점 수량). 환산액이 1센트 미만이면 적립만 되고 잔액 이월. 정규장 종료 1시간 전까지만 접수되며, 그 이후는 적립만 반영. 워커 `dca-loop`가 US 정규장 중 15분 폴로 거래일당 1회 실행.

## 실거래 차수 예산

예약 매수는 `/stocks/split/reservations`에서 등록합니다. 감시 가격과 한국시간 유효일, 차수별 전략을 저장한 뒤 상세 화면에서 시작하면 현재가가 감시 가격 이하일 때 1차 지정가 주문을 제출합니다. 첫 체결 후에는 기존 분할매매로 이어지며 최초 감시 가격·유효일은 재적용하지 않습니다. 실행·실패·만료 내역은 보존하고 각 내역 탭에서 최근 200건을 표시합니다. 실패 후에는 미해결 주문을 먼저 대조하고 예약 조건을 다시 저장한 뒤 재개합니다. 배포 시 `20261101000000_add_split_reservations` migration과 Prisma generate를 적용하고 개발 서버·워커를 재시작해야 합니다. 구버전 워커는 새 `reserved` 상태를 감시하지 않습니다.

새 전략의 최대 차수 기본값은 10입니다. 예산 방식은 동일 금액 / 누적 배수 / 일정 금액 증가 중 선택합니다. 예산 배수는 2차 예산 ÷ 1차 예산이며, 1차 10만원·2배이면 누적 방식은 10만→20만→40만, 일정 증가는 10만→20만→30만입니다. 차수별 미리보기와 총 필요 자금을 확인하고, 배정 자금 부족 시 저장을 막습니다. 기존 전략은 동일 금액·1배를 유지합니다. 모의 장부는 기존 동일 금액 방식입니다.

## 백업

DB 파일(`data/company-map.db`)을 그대로 복사하면 끝. 다른 머신으로 옮기는 것도 같은 방법.

## 마이그레이션 변경

스키마 변경 시:
```
yarn workspace company-map prisma migrate dev --name <change-name>
```
