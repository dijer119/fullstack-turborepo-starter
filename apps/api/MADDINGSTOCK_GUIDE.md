# 📈 MaddingStock 채널 전용 처리 가이드

## 🎯 기능 개요

`@maddingStock` 텔레그램 채널의 메시지를 실시간으로 수신하고 특별하게 처리하는 기능입니다.

### ✨ 주요 기능

1. **실시간 메시지 수신** - maddingStock 채널의 새 메시지 자동 감지
2. **자동 파싱** - 주식명, 가격, 변동률, 키워드 자동 추출
3. **메모리 저장** - 최근 100개 메시지 메모리에 저장
4. **검색 기능** - 키워드로 메시지 검색
5. **통계 제공** - 언급된 주식, 키워드 빈도 등
6. **WebSocket 실시간 전송** - 프론트엔드로 실시간 푸시

## 🚀 설정 방법

### 1. 환경 변수 설정

`apps/api/.env` 파일에 maddingStock 채널 추가:

```env
# 단독으로
TELEGRAM_CHANNELS=maddingStock

# 다른 채널과 함께
TELEGRAM_CHANNELS=telegram,maddingStock,durov
```

### 2. 서버 실행

```bash
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
yarn dev
```

## 📊 자동 파싱 기능

maddingStock 메시지에서 자동으로 추출되는 정보:

### 1. 주식명
```
예: "삼성전자", "카카오", "네이버"
정규식: /[가-힣]+전자|[가-힣]+바이오|[가-힣]+제약|[가-힣]{2,}/
```

### 2. 가격
```
예: "50,000원", "5만원", "$100"
정규식: /(\d{1,3}(,\d{3})*|\d+)원?|\$\d+/g
```

### 3. 변동률
```
예: "+5%", "-3.2%", "▲2.5%"
정규식: /[▲▼+-]?\s*\d+\.?\d*%/g
```

### 4. 키워드
```
자동 감지: 매수, 매도, 상승, 하락, 급등, 급락, 추천, 주목,
          목표가, 저가매수, 고가매도, 신고가, 신저가, 반등, 조정
```

### 5. 해시태그
```
예: #주식, #매수, #추천
정규식: /#[가-힣A-Za-z0-9_]+/g
```

### 6. URL
```
정규식: /https?:\/\/[^\s]+/g
```

## 💻 콘솔 출력 예시

새 메시지가 도착하면 다음과 같이 출력됩니다:

```
╔════════════════════════════════════════════════╗
║  📈 MADDINGSTOCK MESSAGE                       ║
╚════════════════════════════════════════════════╝
🆔 Message ID: 12345
📅 Time: 2025-11-30 오후 9:30:00
📝 Raw Text:
삼성전자 50,000원 ▲5% 급등! 매수 추천 #주식 #매수

📊 Parsed Data:
   주식명: 삼성전자
   가격: 50,000원
   변동률: ▲5%
   키워드: 급등, 매수, 추천
═══════════════════════════════════════════════════
```

## 🌐 REST API 엔드포인트

### 1. 저장된 메시지 조회

```bash
GET /telegram/maddingstock/messages?limit=20
```

**예시:**
```bash
curl "http://localhost:3001/telegram/maddingstock/messages?limit=10"
```

**응답:**
```json
{
  "total": 50,
  "messages": [
    {
      "id": 12345,
      "rawText": "삼성전자 50,000원 ▲5% 급등!",
      "parsed": {
        "stockName": "삼성전자",
        "price": "50,000원",
        "changePercent": "▲5%",
        "keywords": ["급등"],
        "symbols": ["#주식"],
        "urls": []
      },
      "timestamp": "2025-11-30T21:30:00.000Z",
      "channelUsername": "maddingStock",
      "processed": true
    }
  ]
}
```

### 2. 메시지 검색

```bash
GET /telegram/maddingstock/search?keyword=삼성전자
```

**예시:**
```bash
# 주식명으로 검색
curl "http://localhost:3001/telegram/maddingstock/search?keyword=삼성전자"

# 키워드로 검색
curl "http://localhost:3001/telegram/maddingstock/search?keyword=급등"
```

**응답:**
```json
{
  "total": 5,
  "keyword": "삼성전자",
  "messages": [...]
}
```

### 3. 통계 조회

```bash
GET /telegram/maddingstock/stats
```

**예시:**
```bash
curl "http://localhost:3001/telegram/maddingstock/stats"
```

**응답:**
```json
{
  "totalMessages": 50,
  "stocksMentioned": ["삼성전자", "카카오", "네이버"],
  "topKeywords": [
    { "keyword": "급등", "count": 15 },
    { "keyword": "매수", "count": 12 },
    { "keyword": "추천", "count": 10 }
  ],
  "recentMessages": [...]
}
```

## 📡 WebSocket 실시간 수신

### 프론트엔드 연결

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

// maddingStock 전용 이벤트 수신
socket.on('maddingstock:message', (data) => {
  console.log('📈 MaddingStock 메시지:', data);
  
  // 주식명 표시
  if (data.parsed.stockName) {
    console.log(`주식: ${data.parsed.stockName}`);
  }
  
  // 가격 표시
  if (data.parsed.price) {
    console.log(`가격: ${data.parsed.price}`);
  }
  
  // 변동률 표시
  if (data.parsed.changePercent) {
    console.log(`변동률: ${data.parsed.changePercent}`);
  }
});

// 일반 텔레그램 메시지 (다른 채널)
socket.on('telegram:message', (data) => {
  console.log('📬 일반 메시지:', data);
});
```

### React 컴포넌트 예시

```tsx
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

function MaddingStockFeed() {
  const [messages, setMessages] = useState([]);
  
  useEffect(() => {
    const socket = io('http://localhost:3001');
    
    socket.on('maddingstock:message', (data) => {
      setMessages((prev) => [data, ...prev]);
    });
    
    return () => socket.disconnect();
  }, []);
  
  return (
    <div className="maddingstock-feed">
      <h2>📈 MaddingStock 실시간 피드</h2>
      {messages.map((msg) => (
        <div key={msg.id} className="message-card">
          {msg.parsed.stockName && (
            <h3>🏢 {msg.parsed.stockName}</h3>
          )}
          {msg.parsed.price && (
            <p>💰 가격: {msg.parsed.price}</p>
          )}
          {msg.parsed.changePercent && (
            <p>📊 변동: {msg.parsed.changePercent}</p>
          )}
          {msg.parsed.keywords.length > 0 && (
            <p>🏷️ {msg.parsed.keywords.join(', ')}</p>
          )}
          <p className="text-sm">{msg.rawText}</p>
          <small>{new Date(msg.timestamp).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}
```

## 🔧 커스터마이징

### 파싱 규칙 수정

`telegram.service.ts`의 `parseMaddingStockMessage` 함수를 수정하여 파싱 규칙을 커스터마이징할 수 있습니다:

```typescript:288:329:apps/api/src/telegram/telegram.service.ts
private parseMaddingStockMessage(text: string) {
  const parsed: any = {
    stockName: null,
    price: null,
    changePercent: null,
    keywords: [],
    symbols: [],
    urls: [],
  };

  // 여기에 커스텀 파싱 로직 추가
  // ...
}
```

### 키워드 추가

```typescript
const keywords = [
  '매수', '매도', '상승', '하락', '급등', '급락', 
  '추천', '주목', '목표가', '저가매수', '고가매도',
  '신고가', '신저가', '반등', '조정',
  // 여기에 새로운 키워드 추가
  '관심주', '단타', '스윙', '장투'
];
```

### 저장 개수 조정

```typescript:275:277:apps/api/src/telegram/telegram.service.ts
// 메모리에 저장 (최근 100개만 유지)
if (this.maddingStockMessages.length > 100) {
  this.maddingStockMessages = this.maddingStockMessages.slice(0, 100);
}
```

100을 원하는 숫자로 변경하세요.

## 🗄️ 데이터베이스 저장 (선택사항)

메모리 대신 데이터베이스에 저장하려면:

### 1. Prisma 스키마 추가

```prisma
model MaddingStockMessage {
  id              Int      @id @default(autoincrement())
  messageId       Int      @unique
  rawText         String
  stockName       String?
  price           String?
  changePercent   String?
  keywords        String[]
  symbols         String[]
  urls            String[]
  timestamp       DateTime
  channelUsername String
  createdAt       DateTime @default(now())

  @@map("maddingstock_messages")
}
```

### 2. 서비스 수정

```typescript
private async handleMaddingStockMessage(messageData: any, originalMessage: any) {
  // ... 파싱 로직

  // 데이터베이스에 저장
  await this.prisma.maddingStockMessage.create({
    data: {
      messageId: messageData.id,
      rawText: text,
      stockName: parsedData.stockName,
      price: parsedData.price,
      changePercent: parsedData.changePercent,
      keywords: parsedData.keywords,
      symbols: parsedData.symbols,
      urls: parsedData.urls,
      timestamp: timestamp,
      channelUsername: messageData.channelUsername,
    },
  });
}
```

## 🧪 테스트

### 1. 서버 실행 및 모니터링 시작

```bash
# 터미널 1: 백엔드 서버
cd /Users/dijer/dev/workspace/fullstack-turborepo-starter
yarn dev
```

### 2. 상태 확인

```bash
# 터미널 2
curl http://localhost:3001/telegram/status
```

### 3. maddingStock 메시지 조회

```bash
# 최근 메시지
curl http://localhost:3001/telegram/maddingstock/messages

# 통계
curl http://localhost:3001/telegram/maddingstock/stats

# 검색
curl "http://localhost:3001/telegram/maddingstock/search?keyword=삼성전자"
```

## 📊 활용 사례

### 1. 실시간 주식 모니터링 대시보드
- WebSocket으로 실시간 메시지 수신
- 주식명, 가격, 변동률 실시간 표시

### 2. 주식 추천 알림 시스템
- "추천", "매수" 키워드 감지 시 알림
- 특정 주식명 언급 시 알림

### 3. 키워드 트렌드 분석
- 시간대별 키워드 빈도 분석
- 가장 많이 언급된 주식 분석

### 4. 자동 거래 시스템 (고급)
- 특정 조건 만족 시 자동 거래 실행
- 백테스팅을 통한 전략 검증

## 🔒 보안 주의사항

1. **API 키 보호** - .env 파일을 절대 커밋하지 마세요
2. **Rate Limiting** - 프로덕션에서는 API 속도 제한 필요
3. **데이터 검증** - 파싱된 데이터는 항상 검증 후 사용
4. **투자 책임** - 이 도구는 정보 제공용이며, 투자 손실 책임은 사용자에게 있습니다

## 🐛 문제 해결

### 메시지가 파싱되지 않음
- 파싱 규칙이 메시지 형식과 맞지 않을 수 있습니다
- `parseMaddingStockMessage` 함수의 정규식을 조정하세요

### 메시지가 수신되지 않음
- `TELEGRAM_CHANNELS`에 `maddingStock`이 포함되어 있는지 확인
- 채널명이 정확한지 확인 (대소문자 구분 없음)

### 메모리 부족
- 저장 개수를 줄이거나 데이터베이스 사용을 고려하세요

## 📝 요약

```bash
# 1. 환경 변수 설정
TELEGRAM_CHANNELS=maddingStock

# 2. 서버 실행
yarn dev

# 3. API 사용
curl http://localhost:3001/telegram/maddingstock/messages
curl http://localhost:3001/telegram/maddingstock/stats
curl "http://localhost:3001/telegram/maddingstock/search?keyword=삼성전자"

# 4. WebSocket 연결
socket.on('maddingstock:message', callback)
```

🎉 이제 maddingStock 채널의 메시지를 실시간으로 모니터링하고 분석할 수 있습니다!

