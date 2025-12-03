# 📊 MaddingStock 메시지 파싱 가이드

## 지원하는 메시지 포맷

MaddingStock 채널에서 수신되는 다양한 포맷의 메시지를 자동으로 파싱합니다.

### ✅ 포맷 1: 기본 (4개 필드)
```
[전략A][삼성전자][매수][50000]
```

**파싱 결과:**
```json
{
  "strategy": "전략A",
  "stockName": "삼성전자",
  "tradeType": "매수",
  "status": null,
  "price": "50000",
  "additionalInfo": null,
  "profitRate": null,
  "keywords": ["전략A", "매수"]
}
```

### ✅ 포맷 2: 상태 포함 + 추가정보 (5개 필드 + 추가정보)
```
[전략A][일진전기][매수][접근][51000] :  1차(50400) 접근
```

**파싱 결과:**
```json
{
  "strategy": "전략A",
  "stockName": "일진전기",
  "tradeType": "매수",
  "status": "접근",
  "price": "51000",
  "additionalInfo": "1차(50400) 접근",
  "profitRate": null,
  "keywords": ["전략A", "매수", "접근", "차"]
}
```

### ✅ 포맷 3: 완전 (5개 필드 + 추가정보 + 손익율)
```
[전략C][싸이닉솔루션][매도][도달][10280] : 강화 반등 - 손익율:8.98%
```

**파싱 결과:**
```json
{
  "strategy": "전략C",
  "stockName": "싸이닉솔루션",
  "tradeType": "매도",
  "status": "도달",
  "price": "10280",
  "additionalInfo": "강화 반등",
  "profitRate": "8.98%",
  "keywords": ["전략C", "매도", "도달", "강화", "반등"]
}
```

## 📋 파싱되는 필드

| 필드 | 설명 | 예시 | 필수 여부 |
|------|------|------|----------|
| `strategy` | 전략 유형 | 전략A, 전략B, 전략C | ✅ 필수 |
| `stockName` | 주식명 | 삼성전자, 일진전기, 싸이닉솔루션 | ✅ 필수 |
| `tradeType` | 매매 유형 | 매수, 매도 | ✅ 필수 |
| `status` | 상태 | 도달, 접근 등 | ⭕ 선택 |
| `price` | 가격 | 50000, 51000, 10280 | ✅ 필수 |
| `additionalInfo` | 추가 정보 | 강화 반등, 1차(50400) 접근 | ⭕ 선택 |
| `profitRate` | 손익율 | 8.98% | ⭕ 선택 |
| `keywords` | 자동 추출된 키워드 | ["전략C", "매도", "도달"] | ✅ 자동 |

## 🔧 파싱 로직

### 1단계: 기본 구조 파싱

정규식을 사용하여 대괄호로 묶인 기본 필드를 추출합니다:

```typescript
const basicPattern = /\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\](?:\[([^\]]+)\])?\[?(\d+)\]?/;
```

- `[전략]` → strategy
- `[주식명]` → stockName
- `[매매유형]` → tradeType
- `[상태]` (선택적) → status
- `[가격]` → price

### 2단계: 추가 정보 파싱

`:` 이후의 내용을 파싱합니다:

```typescript
const colonIndex = text.indexOf(':');
if (colonIndex !== -1) {
  const afterColon = text.substring(colonIndex + 1).trim();
  // ...
}
```

### 3단계: 손익율 추출

추가 정보에서 손익율을 별도로 추출합니다:

```typescript
const profitMatch = afterColon.match(/손익율:?\s*([\d.]+%)/);
```

### 4단계: 키워드 자동 추출

파싱된 필드와 추가 정보에서 키워드를 자동으로 추출합니다:

```typescript
// 주요 필드를 키워드로 추가
if (parsed.strategy) parsed.keywords.push(parsed.strategy);
if (parsed.tradeType) parsed.keywords.push(parsed.tradeType);
if (parsed.status) parsed.keywords.push(parsed.status);

// 추가 정보에서 한글 키워드 추출
const infoKeywords = parsed.additionalInfo.match(/[가-힣]+/g);
```

## 🧪 테스트

### 테스트 실행

```bash
cd apps/api
npx ts-node scripts/test-message-parsing.ts
```

### 테스트 케이스

테스트 스크립트는 다음 세 가지 포맷을 검증합니다:

1. **기본 포맷** (4개 필드)
2. **추가 정보 포함** (5개 필드 + 추가정보)
3. **완전한 포맷** (5개 필드 + 추가정보 + 손익율)

### 테스트 결과 예시

```bash
================================================================================
📊 메시지 파싱 테스트
================================================================================

1. 테스트 1: 손익율 있음
✅ 테스트 통과!

2. 테스트 2: 손익율 없음
✅ 테스트 통과!

3. 테스트 3: 상태 없음
✅ 테스트 통과!
================================================================================
```

## 💾 데이터베이스 저장

파싱된 데이터는 자동으로 Prisma를 통해 PostgreSQL 데이터베이스에 저장됩니다.

### 스키마

```prisma
model MaddingStockMessage {
  id              Int      @id @default(autoincrement())
  messageId       BigInt   @unique
  rawText         String   @db.Text
  strategy        String?
  stockName       String?
  tradeType       String?
  status          String?
  price           String?
  additionalInfo  String?
  profitRate      String?
  changePercent   String?
  keywords        String[]
  symbols         String[]
  urls            String[]
  messageDate     DateTime
  channelUsername String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

## 🖥️ 프론트엔드 표시

파싱된 데이터는 프론트엔드에서 다음과 같이 표시됩니다:

```
┌─────────────────────────────────────────────────────────┐
│ [전략C] [🏢 싸이닉솔루션] [📉 매도] [도달]              │
│ [💰 10280] [💵 손익율: 8.98%] [ℹ️ 강화 반등]             │
│                                                         │
│ 원본 메시지:                                             │
│ [전략C][싸이닉솔루션][매도][도달][10280] : 강화 반등...  │
│                                                         │
│ 🏷️ 키워드: 전략C, 매도, 도달, 강화, 반등                 │
└─────────────────────────────────────────────────────────┘
```

## 📊 실시간 모니터링

서버에서 실시간으로 메시지를 파싱하고 로그를 출력합니다:

```bash
╔════════════════════════════════════════════════╗
║  📈 MADDINGSTOCK MESSAGE (💾 SAVED TO DB)      ║
╚════════════════════════════════════════════════╝
🆔 Message ID: 12345
💾 DB ID: 67
📅 Time: 2024-01-15 14:30:00
📝 Raw Text:
[전략C][싸이닉솔루션][매도][도달][10280] : 강화 반등 - 손익율:8.98%

📊 Parsed Data:
   전략: 전략C
   주식명: 싸이닉솔루션
   매매유형: 매도
   상태: 도달
   가격: 10280
   추가정보: 강화 반등
   손익율: 8.98%
   키워드: 전략C, 매도, 도달, 강화, 반등
═══════════════════════════════════════════════════
```

## 🔍 검색 기능

파싱된 데이터는 다음 조건으로 검색할 수 있습니다:

- **주식명** 검색
- **키워드** 검색
- **원본 텍스트** 검색

### API 엔드포인트

```bash
# 전체 메시지 조회
GET /telegram/maddingstock/messages?limit=20&offset=0

# 검색
GET /telegram/maddingstock/search?keyword=삼성전자&limit=20

# 통계
GET /telegram/maddingstock/stats
```

## 📈 통계

자동으로 다음 통계를 생성합니다:

- 전체 메시지 수
- 언급된 주식 수
- 인기 키워드 Top 10

```json
{
  "totalMessages": 150,
  "stocksMentioned": ["삼성전자", "일진전기", "싸이닉솔루션"],
  "topKeywords": [
    { "keyword": "매수", "count": 80 },
    { "keyword": "매도", "count": 70 },
    { "keyword": "전략A", "count": 50 }
  ]
}
```

## 🚀 사용 방법

### 서버 실행

```bash
# 백엔드
cd apps/api
yarn dev

# 프론트엔드
cd apps/web
yarn dev
```

### 메시지 확인

1. 브라우저에서 `http://localhost:3000/maddingstock` 접속
2. 실시간으로 수신된 메시지 확인
3. 검색, 필터링, 통계 확인

## ⚙️ 설정

### 환경 변수

```bash
# apps/api/.env
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_SESSION_STRING=your_session_string
TELEGRAM_CHANNELS=telegram,maddingStock
```

## 🐛 문제 해결

### 파싱이 안되는 경우

1. **메시지 포맷 확인**: 대괄호 `[]`로 올바르게 구분되어 있는지 확인
2. **로그 확인**: 서버 로그에서 파싱 결과 확인
3. **테스트 실행**: 테스트 스크립트로 파싱 로직 검증

### 디버깅

```bash
# 테스트 스크립트 실행
cd apps/api
npx ts-node scripts/test-message-parsing.ts

# 서버 로그 확인
yarn dev
# 메시지 수신 시 자동으로 로그 출력됨
```

## 📚 추가 정보

- **Telegram 설정**: `/apps/api/TELEGRAM_GUIDE.md`
- **실시간 기능**: `/apps/api/REALTIME_TELEGRAM.md`
- **전체 가이드**: `/apps/api/MADDINGSTOCK_GUIDE.md`

## ✅ 체크리스트

새로운 포맷 추가 시:

- [ ] `parseMaddingStockMessage` 함수 수정
- [ ] 테스트 케이스 추가
- [ ] 테스트 실행 및 통과 확인
- [ ] 프론트엔드 UI 업데이트 (필요시)
- [ ] 문서 업데이트

🎉 모든 메시지 포맷이 정상적으로 파싱됩니다!

