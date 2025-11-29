# 실시간 텔레그램 메시지 모니터링 가이드

## 🎯 기능

- ✅ 서버 시작 시 자동으로 채널 모니터링 시작
- ✅ 새 메시지가 올라오면 실시간으로 콘솔 출력
- ✅ WebSocket을 통해 프론트엔드에 실시간 전송
- ✅ 동적으로 채널 추가/제거 가능

## 🚀 설정 방법

### 1. 세션 생성 (아직 안했다면)

```bash
cd apps/api
yarn telegram:session
```

생성된 `TELEGRAM_SESSION_STRING`을 `.env`에 추가

### 2. 모니터링할 채널 설정

`.env` 파일에 다음 추가:

```env
# 쉼표로 구분하여 여러 채널 추가 가능
TELEGRAM_CHANNELS=telegram,durov

# 또는 하나만
TELEGRAM_CHANNELS=telegram
```

### 3. 서버 실행

```bash
yarn dev
```

## 📊 실행 시 동작

### 서버 시작 시 출력 예시

```
[Nest] Starting Nest application...
[TelegramService] ✅ Telegram client connected successfully
[TelegramService] 📡 Setting up real-time listeners for 2 channel(s)...
[TelegramService] ✅ Monitoring @telegram (5 recent messages)
[TelegramService] 📨 [@telegram] Welcome to Telegram!
[TelegramService] 📨 [@telegram] Check out our new features...
[TelegramService] ✅ Monitoring @durov (5 recent messages)
[TelegramService] 📨 [@durov] New update coming soon...
[TelegramService] 🎉 Real-time message monitoring active!
```

### 새 메시지 수신 시 출력 예시

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📬 NEW MESSAGE from @telegram
📝 This is a new message just posted!
🕐 2025-11-29 21:30:45
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 🌐 WebSocket 연결

### 프론트엔드 연결 예시

```typescript
import { io } from 'socket.io-client';

// WebSocket 연결
const socket = io('http://localhost:3001');

// 새 메시지 수신
socket.on('telegram:message', (data) => {
  console.log('📬 New message:', data);
  // {
  //   channel: 'telegram',
  //   message: {
  //     id: 12345,
  //     text: 'Message content',
  //     date: 1234567890,
  //     channelUsername: 'telegram'
  //   },
  //   timestamp: '2025-11-29T...'
  // }
});

// 연결 상태
socket.on('connect', () => {
  console.log('✅ Connected to server');
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});
```

### HTML 예시

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
</head>
<body>
  <h1>Telegram Real-time Messages</h1>
  <div id="messages"></div>

  <script>
    const socket = io('http://localhost:3001');
    
    socket.on('telegram:message', (data) => {
      const div = document.getElementById('messages');
      const msg = document.createElement('div');
      msg.innerHTML = `
        <strong>@${data.channel}</strong>: ${data.message.text}
        <br><small>${new Date(data.timestamp).toLocaleString()}</small>
        <hr>
      `;
      div.prepend(msg);
    });
  </script>
</body>
</html>
```

## 📡 REST API 엔드포인트

### 모니터링 상태 확인

```bash
GET /telegram/monitoring
```

**응답:**
```json
{
  "channels": ["telegram", "durov"],
  "count": 2
}
```

### 채널 모니터링 시작 (동적 추가)

```bash
POST /telegram/monitoring/start/:channel
```

**예시:**
```bash
curl -X POST http://localhost:3001/telegram/monitoring/start/bitcoin
```

### 채널 모니터링 중지

```bash
POST /telegram/monitoring/stop/:channel
```

**예시:**
```bash
curl -X POST http://localhost:3001/telegram/monitoring/stop/bitcoin
```

## 🧪 테스트 방법

### 1. 서버 실행
```bash
yarn dev
```

### 2. 상태 확인 (다른 터미널)
```bash
curl http://localhost:3001/telegram/status
```

**응답:**
```json
{
  "isConnected": true,
  "hasClient": true,
  "monitoredChannels": ["telegram"]
}
```

### 3. 모니터링 채널 확인
```bash
curl http://localhost:3001/telegram/monitoring
```

### 4. 실시간 메시지 확인

서버 콘솔을 보면서 모니터링 중인 채널에 새 메시지를 작성하면 즉시 출력됩니다!

## 🔧 설정 예시

### 단일 채널
```env
TELEGRAM_CHANNELS=telegram
```

### 여러 채널
```env
TELEGRAM_CHANNELS=telegram,durov,bitcoin
```

### 한국어 채널
```env
TELEGRAM_CHANNELS=ytn_official,jtbc_news
```

## 💡 활용 사례

### 1. 뉴스 채널 모니터링
```env
TELEGRAM_CHANNELS=ytn_official,jtbc_news,sbs_news
```

### 2. 암호화폐 채널 모니터링
```env
TELEGRAM_CHANNELS=bitcoin,ethereum,binance
```

### 3. 기술 채널 모니터링
```env
TELEGRAM_CHANNELS=telegram,github,stackoverflow
```

## 📊 WebSocket 이벤트

### telegram:message
새 메시지가 도착했을 때

```javascript
{
  channel: 'telegram',
  message: {
    id: 12345,
    text: 'Message content',
    date: 1234567890,
    channelUsername: 'telegram'
  },
  timestamp: '2025-11-29T21:30:45.123Z'
}
```

### telegram:update
채널 업데이트 (추후 확장용)

## 🎨 프론트엔드 통합 예시

### React Hook

```typescript
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

function useTelegramMessages() {
  const [messages, setMessages] = useState([]);
  
  useEffect(() => {
    const socket = io('http://localhost:3001');
    
    socket.on('telegram:message', (data) => {
      setMessages((prev) => [data, ...prev]);
    });
    
    return () => {
      socket.disconnect();
    };
  }, []);
  
  return messages;
}

// 사용
function TelegramFeed() {
  const messages = useTelegramMessages();
  
  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.message.id}>
          <strong>@{msg.channel}</strong>: {msg.message.text}
        </div>
      ))}
    </div>
  );
}
```

## 🔒 보안 주의사항

1. **세션 문자열 보호**
   - `.env` 파일은 절대 커밋하지 마세요
   - `.gitignore`에 포함되어 있는지 확인

2. **채널 권한**
   - Public 채널: 누구나 접근 가능
   - Private 채널: 멤버만 접근 가능
   - 권한 없는 채널은 오류 발생

3. **WebSocket CORS**
   - 프로덕션에서는 `origin`을 제한하세요
   - 현재는 `*`로 모든 출처 허용 (개발용)

## 🐛 문제 해결

### 메시지가 안 보임

**확인 사항:**
1. `.env`의 `TELEGRAM_CHANNELS` 설정 확인
2. 세션이 올바르게 설정되었는지 확인
3. 채널이 Public인지 확인
4. 서버 콘솔에서 오류 메시지 확인

### WebSocket 연결 실패

**확인 사항:**
1. 서버가 실행 중인지 확인
2. 포트 3001이 열려있는지 확인
3. 방화벽 설정 확인

### 채널을 찾을 수 없음

**해결 방법:**
1. 채널 사용자명 확인 (@는 제외)
2. 채널이 공개 채널인지 확인
3. Private 채널은 멤버로 가입 필요

## 📝 요약

### 모니터링 시작 (자동)
```env
TELEGRAM_CHANNELS=telegram
```
서버 실행 시 자동으로 모니터링 시작

### 모니터링 추가 (동적)
```bash
curl -X POST http://localhost:3001/telegram/monitoring/start/durov
```

### 모니터링 중지
```bash
curl -X POST http://localhost:3001/telegram/monitoring/stop/durov
```

## 🎉 완료!

이제 서버를 실행하면 설정된 채널의 메시지가 실시간으로 출력됩니다!

