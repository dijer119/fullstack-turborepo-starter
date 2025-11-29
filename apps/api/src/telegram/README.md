# Telegram Module

텔레그램 채널 메시지를 받아서 보여주는 NestJS 모듈입니다.

## 📋 기능

- ✅ 텔레그램 채널 정보 조회
- ✅ 채널 메시지 가져오기
- ✅ 채널 메시지 검색
- ✅ 연결 상태 확인
- ✅ 미디어 정보 파싱 (사진, 문서, 웹페이지)

## 🚀 빠른 시작

### 1. 서버 실행

```bash
yarn dev
```

### 2. API 테스트

```bash
# 연결 상태 확인
curl http://localhost:3001/telegram/status

# 채널 메시지 가져오기
curl "http://localhost:3001/telegram/messages?channel=telegram&limit=10"
```

## 📡 API 엔드포인트

### GET /telegram/status
연결 상태 확인

### GET /telegram/channel/:username
채널 정보 조회

### GET /telegram/messages
채널 메시지 가져오기

**쿼리 파라미터:**
- `channel`: 채널 사용자명
- `limit`: 메시지 개수 (기본: 10, 최대: 100)

### GET /telegram/search  
채널 메시지 검색

**쿼리 파라미터:**
- `channel`: 채널 사용자명
- `query`: 검색 키워드
- `limit`: 결과 개수 (기본: 10, 최대: 100)

## 🔧 구조

```
telegram/
├── dto/
│   └── get-messages.dto.ts      # DTO 정의
├── telegram.controller.ts       # REST API 컨트롤러
├── telegram.service.ts          # 비즈니스 로직
├── telegram.module.ts           # 모듈 정의
└── README.md                    # 이 파일
```

## 📖 상세 가이드

전체 사용 가이드는 [TELEGRAM_GUIDE.md](../../TELEGRAM_GUIDE.md)를 참고하세요.

