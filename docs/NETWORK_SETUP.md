# 🌐 네트워크 접속 설정 가이드

## 문제 해결: "error fetching from backend"

다른 컴퓨터에서 웹에 접속할 때 백엔드 연결 오류가 발생하는 문제를 해결했습니다.

## ✅ 적용된 수정사항

### 1. 백엔드 CORS 설정 ✅

```typescript
// apps/api/src/main.ts
app.enableCors({
  origin: true, // 모든 출처 허용
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// 0.0.0.0으로 바인딩하여 외부 접속 허용
await app.listen(PORT, '0.0.0.0');
```

### 2. Next.js API 프록시 설정 ✅

```javascript
// apps/web/next.config.js
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
    },
  ];
}
```

### 3. 동적 API URL 설정 ✅

```typescript
// apps/web/src/store/services/*.ts
baseUrl: typeof window === 'undefined' 
  ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001")
  : "/api",
```

## 🚀 사용 방법

### 옵션 1: 같은 네트워크 (로컬 네트워크)

#### 1단계: 서버 IP 확인

##### macOS/Linux
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
# 예: 192.168.0.100
```

##### Windows
```bash
ipconfig
# 예: 192.168.0.100
```

#### 2단계: 환경 변수 설정

```bash
# apps/web/.env
NEXT_PUBLIC_API_URL=http://192.168.0.100:3001
```

#### 3단계: 서버 실행

```bash
# 터미널 1: 백엔드
cd apps/api
yarn dev
# Server running on http://localhost:3001
# Network access: http://192.168.0.100:3001

# 터미널 2: 프론트엔드
cd apps/web
yarn dev
# Local: http://localhost:3000
# Network: http://192.168.0.100:3000
```

#### 4단계: 다른 컴퓨터에서 접속

```
http://192.168.0.100:3000
```

### 옵션 2: 프록시 사용 (권장)

프록시를 사용하면 환경 변수 설정 없이도 자동으로 작동합니다.

#### 작동 원리
```
브라우저 → http://192.168.0.100:3000/api/telegram/status
          ↓
Next.js 서버 (프록시)
          ↓
백엔드 → http://localhost:3001/telegram/status
```

#### 장점
- ✅ 클라이언트는 `/api/*`로 요청
- ✅ Next.js가 자동으로 백엔드로 프록시
- ✅ CORS 문제 없음
- ✅ 환경 변수 수정 불필요

## 🧪 테스트

### 1. 로컬 테스트
```bash
curl http://localhost:3000/api
# "Hello world!!" 응답
```

### 2. 네트워크 테스트
```bash
# 다른 컴퓨터에서
curl http://192.168.0.100:3000/api
# "Hello world!!" 응답
```

### 3. 브라우저 테스트
```
http://192.168.0.100:3000
http://192.168.0.100:3000/maddingstock
```

## 🔧 방화벽 설정

### macOS
```bash
# 포트 허용
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add <path-to-node>
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp <path-to-node>
```

### Windows
```bash
# Windows Defender 방화벽
# 설정 > 업데이트 및 보안 > Windows 보안 > 방화벽
# 인바운드 규칙 추가: 포트 3000, 3001
```

### Linux (Ubuntu)
```bash
sudo ufw allow 3000
sudo ufw allow 3001
sudo ufw reload
```

## 📱 모바일 접속

### 같은 WiFi 네트워크
```
http://192.168.0.100:3000
http://192.168.0.100:3000/maddingstock
```

## 🌍 인터넷 공개 (선택사항)

### ngrok 사용 (무료)

#### 설치
```bash
# macOS
brew install ngrok

# 다른 OS
# https://ngrok.com/download
```

#### 실행
```bash
# 백엔드 터널
ngrok http 3001
# Forwarding: https://abcd1234.ngrok.io -> http://localhost:3001

# 프론트엔드 터널 (다른 터미널)
ngrok http 3000
# Forwarding: https://efgh5678.ngrok.io -> http://localhost:3000
```

#### 환경 변수 설정
```bash
# apps/web/.env
NEXT_PUBLIC_API_URL=https://abcd1234.ngrok.io
```

#### 접속
```
https://efgh5678.ngrok.io
```

### Cloudflare Tunnel (무료)

```bash
# 설치
brew install cloudflared

# 실행
cloudflared tunnel --url http://localhost:3000
```

## 🐛 문제 해결

### 1. "Cannot GET /api"

**원인**: Next.js 서버가 재시작되지 않음

**해결**:
```bash
cd apps/web
yarn dev
```

### 2. "CORS error"

**원인**: 백엔드 CORS 설정 누락

**해결**:
```bash
# main.ts에서 app.enableCors() 확인
cd apps/api
yarn build
yarn dev
```

### 3. "Connection refused"

**원인**: 백엔드가 0.0.0.0으로 바인딩되지 않음

**해결**:
```bash
# main.ts에서 app.listen(PORT, '0.0.0.0') 확인
cd apps/api
yarn build
yarn dev
```

### 4. "Timeout"

**원인**: 방화벽 또는 네트워크 문제

**해결**:
```bash
# 방화벽 확인
# macOS
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# 네트워크 연결 확인
ping 192.168.0.100
```

## 📊 네트워크 구성도

### 로컬 개발
```
┌─────────────────────────────────────────┐
│  브라우저 (localhost:3000)               │
│                                         │
│  http://localhost:3000/api/*            │
└────────────┬────────────────────────────┘
             │ Next.js 프록시
             ↓
┌─────────────────────────────────────────┐
│  백엔드 (localhost:3001)                 │
└─────────────────────────────────────────┘
```

### 네트워크 접속
```
┌─────────────────────────────────────────┐
│  다른 컴퓨터 (192.168.0.50)              │
│                                         │
│  http://192.168.0.100:3000/api/*        │
└────────────┬────────────────────────────┘
             │ 네트워크
             ↓
┌─────────────────────────────────────────┐
│  서버 (192.168.0.100)                    │
│                                         │
│  Next.js :3000 ──프록시──> 백엔드 :3001  │
└─────────────────────────────────────────┘
```

## 🎯 권장 설정

### 개발 환경
```bash
# apps/web/.env
NEXT_PUBLIC_API_URL=http://localhost:3001
NODE_ENV=development
```

### 프로덕션 환경
```bash
# apps/web/.env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NODE_ENV=production
```

## ✅ 체크리스트

서버 실행 전 확인:

- [ ] `apps/api/src/main.ts`에 `app.enableCors()` 추가됨
- [ ] `apps/api/src/main.ts`에 `app.listen(PORT, '0.0.0.0')` 설정됨
- [ ] `apps/web/next.config.js`에 `rewrites()` 추가됨
- [ ] `apps/web/.env`에 `NEXT_PUBLIC_API_URL` 설정됨 (선택)
- [ ] 방화벽 포트 3000, 3001 허용
- [ ] 같은 네트워크에 연결되어 있음

## 🚀 빠른 시작

```bash
# 1. 프로젝트 빌드
yarn build

# 2. 서버 IP 확인
ifconfig | grep "inet " | grep -v 127.0.0.1
# 예: 192.168.0.100

# 3. 백엔드 실행
cd apps/api
yarn dev

# 4. 프론트엔드 실행 (다른 터미널)
cd apps/web
yarn dev

# 5. 다른 컴퓨터에서 접속
# http://192.168.0.100:3000
```

## 📝 요약

### 변경사항
1. ✅ CORS 설정 추가
2. ✅ 0.0.0.0 바인딩
3. ✅ Next.js API 프록시
4. ✅ 동적 baseURL

### 효과
- ✅ 다른 컴퓨터에서 접속 가능
- ✅ 모바일에서 접속 가능
- ✅ 같은 네트워크 내 모든 기기 접속 가능
- ✅ CORS 오류 해결

🎉 이제 어디서든 접속할 수 있습니다!

