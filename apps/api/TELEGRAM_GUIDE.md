# Telegram API 가이드

텔레그램 채널 메시지를 받아서 보여주는 API입니다.

## 📋 목차

1. [설정](#설정)
2. [API 엔드포인트](#api-엔드포인트)
3. [사용 예시](#사용-예시)
4. [인증 및 세션](#인증-및-세션)

## 🔧 설정

### 1. 환경변수 설정

`.env` 파일에 다음 정보가 이미 추가되어 있습니다:

```env
TELEGRAM_API_ID=20844279
TELEGRAM_API_HASH=03e6e214da9ce37028e81d0701875722
TELEGRAM_SESSION_STRING=
```

### 2. 첫 연결 시 인증

처음 서버를 실행하면 Telegram이 전화번호 인증을 요구할 수 있습니다.

```bash
yarn dev
```

콘솔에서 전화번호와 인증 코드를 입력하면 `TELEGRAM_SESSION_STRING`이 생성됩니다.
생성된 세션 문자열을 `.env` 파일의 `TELEGRAM_SESSION_STRING`에 저장하세요.

## 📡 API 엔드포인트

### 1. 연결 상태 확인

```http
GET /telegram/status
```

**응답 예시:**
```json
{
  "isConnected": true,
  "hasClient": true
}
```

### 2. 채널 정보 조회

```http
GET /telegram/channel/:username
```

**파라미터:**
- `username`: 채널 사용자명 (예: `@telegram` 또는 `telegram`)

**응답 예시:**
```json
{
  "id": "1234567890",
  "title": "Telegram",
  "username": "telegram",
  "participantsCount": 1000000,
  "about": "Official Telegram Channel",
  "verified": true,
  "restricted": false,
  "scam": false,
  "fake": false
}
```

### 3. 채널 메시지 가져오기

```http
GET /telegram/messages?channel=telegram&limit=10
```

**쿼리 파라미터:**
- `channel` (필수): 채널 사용자명
- `limit` (선택): 가져올 메시지 개수 (기본값: 10, 최대: 100)

**응답 예시:**
```json
[
  {
    "id": 12345,
    "text": "Hello World!",
    "date": 1234567890,
    "views": 1000,
    "forwards": 50,
    "replies": 10,
    "media": null
  },
  {
    "id": 12346,
    "text": "Another message",
    "date": 1234567891,
    "views": 800,
    "forwards": 30,
    "replies": 5,
    "media": {
      "type": "photo",
      "hasPhoto": true
    }
  }
]
```

### 4. 채널 메시지 검색

```http
GET /telegram/search?channel=telegram&query=hello&limit=10
```

**쿼리 파라미터:**
- `channel` (필수): 채널 사용자명
- `query` (필수): 검색 키워드
- `limit` (선택): 가져올 메시지 개수 (기본값: 10, 최대: 100)

**응답 예시:**
```json
[
  {
    "id": 12345,
    "text": "Hello World!",
    "date": 1234567890,
    "views": 1000,
    "forwards": 50
  }
]
```

## 🚀 사용 예시

### curl 사용

```bash
# 1. 연결 상태 확인
curl http://localhost:3001/telegram/status

# 2. 채널 정보 조회
curl http://localhost:3001/telegram/channel/telegram

# 3. 최근 메시지 10개 가져오기
curl "http://localhost:3001/telegram/messages?channel=telegram&limit=10"

# 4. 메시지 검색
curl "http://localhost:3001/telegram/search?channel=telegram&query=update&limit=5"
```

### JavaScript/TypeScript 사용

```typescript
// 연결 상태 확인
const status = await fetch('http://localhost:3001/telegram/status');
console.log(await status.json());

// 채널 메시지 가져오기
const messages = await fetch(
  'http://localhost:3001/telegram/messages?channel=telegram&limit=10'
);
console.log(await messages.json());

// 메시지 검색
const searchResults = await fetch(
  'http://localhost:3001/telegram/search?channel=telegram&query=hello&limit=5'
);
console.log(await searchResults.json());
```

### Python 사용

```python
import requests

# 채널 메시지 가져오기
response = requests.get(
    'http://localhost:3001/telegram/messages',
    params={'channel': 'telegram', 'limit': 10}
)
messages = response.json()
print(messages)
```

## 🔐 인증 및 세션

### 세션 문자열 생성

최초 실행 시 다음과 같은 절차를 거칩니다:

1. 서버 시작: `yarn dev`
2. 전화번호 입력 요청 (콘솔에 표시됨)
3. Telegram에서 받은 인증 코드 입력
4. 세션 문자열이 콘솔에 출력됨
5. 출력된 세션 문자열을 `.env`의 `TELEGRAM_SESSION_STRING`에 저장

### 세션 재사용

세션 문자열을 저장하면 이후에는 인증 없이 바로 연결됩니다.

```env
TELEGRAM_SESSION_STRING=1AGAOMTq8bAJAABrN...
```

## 📊 메시지 응답 형식

### 메시지 객체

```typescript
{
  id: number;           // 메시지 ID
  text: string;         // 메시지 텍스트
  date: number;         // 타임스탬프 (Unix time)
  views: number;        // 조회수
  forwards: number;     // 전달 횟수
  replies: number;      // 댓글 수
  media: {              // 미디어 정보 (선택)
    type: 'photo' | 'document' | 'webpage' | 'unknown';
    hasPhoto?: boolean;
    hasDocument?: boolean;
    url?: string;
  } | null;
}
```

## 🔍 주요 채널 예시

공개 채널 사용 예시:

```bash
# Telegram 공식 채널
curl "http://localhost:3001/telegram/messages?channel=telegram&limit=5"

# Durov's Channel
curl "http://localhost:3001/telegram/messages?channel=durov&limit=5"

# 한국 뉴스 채널 (예시)
curl "http://localhost:3001/telegram/messages?channel=ytn_official&limit=10"
```

## ⚠️ 주의사항

1. **API Rate Limit**: Telegram API에는 요청 제한이 있습니다. 너무 많은 요청을 보내지 마세요.

2. **Private 채널**: Private 채널은 접근 권한이 필요합니다. 해당 채널의 멤버여야 합니다.

3. **세션 보안**: `TELEGRAM_SESSION_STRING`은 중요한 정보입니다. 외부에 노출되지 않도록 주의하세요.

4. **채널 사용자명**: `@` 기호는 포함하거나 생략할 수 있습니다.
   - ✅ `telegram`
   - ✅ `@telegram`

## 🐛 문제 해결

### 연결 실패

```
Telegram client is not connected
```

**해결 방법:**
1. `TELEGRAM_API_ID`와 `TELEGRAM_API_HASH` 확인
2. 서버 재시작
3. 로그 확인: `yarn dev`

### 채널을 찾을 수 없음

```
Failed to get messages from channelname
```

**해결 방법:**
1. 채널 사용자명이 올바른지 확인
2. 채널이 공개 채널인지 확인
3. Private 채널인 경우 멤버십 확인

### 세션 만료

세션이 만료된 경우:
1. `.env`의 `TELEGRAM_SESSION_STRING`을 비움
2. 서버 재시작하여 재인증
3. 새로운 세션 문자열 저장

## 📚 추가 리소스

- [Telegram API 공식 문서](https://core.telegram.org/api)
- [GramJS 문서](https://gram.js.org/)
- [Telegram Bot API](https://core.telegram.org/bots/api)

## 🎯 다음 단계

1. **데이터베이스 저장**: 받은 메시지를 데이터베이스에 저장
2. **웹훅**: 새 메시지 알림 기능 추가
3. **필터링**: 특정 키워드 필터링 기능
4. **스케줄링**: 주기적으로 메시지 수집
5. **통계**: 메시지 분석 및 통계 기능

