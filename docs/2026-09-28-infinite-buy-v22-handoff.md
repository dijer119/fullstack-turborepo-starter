---
artifact_contract: "ce-handoff/v1"
created_at: "2026-09-28T05:21:03Z"
title: "무한매수 v2.2 T 정의 수정 — 후속 작업 인수인계"
summary: "TQQQ v2.2 LIVE의 회차 T를 체결액 기준으로 교체한 뒤 생긴 리셋 루프 버그 수정분이 미커밋 상태이며, 새 사이클 모니터링 중"
keywords: ["company-map", "infinite-buy", "v2.2", "TQQQ", "T정의", "리셋루프", "worker", "handoff"]
cwd: "/Users/dijer/dev/workspace/fullstack-turborepo-starter"
resume_focus: "리셋 루프 수정분 커밋 → 브랜치 처리 결정 → ce-compound 기록 → 새 사이클 모니터링"
repository: "fullstack-turborepo-starter"
repo_root_sha: "ccfbd9213e3a"
branch: "fix/infinite-buy-v22-t-definition"
head: "86815e7"
---

# 무한매수 v2.2 T 정의 수정 — 후속 작업 인수인계

## 목적과 사용자 의도

company-map `/stocks/infinite-buy`의 TQQQ 사이클(**LIVE, 실계좌**)이 라오어 V2.2 원전 규칙대로 거래되게 하는 것. 사용자는 2026-09-19에 "V2.2 스펙 그대로 + 현 사이클 즉시 적용"을 **직접 선택**했다(쿼터모드·×0.75 T 감소 같은 V4.0 규칙은 넣지 않기로).

- 사이클 id: `3010f15c-24de-4d3e-b1ee-2f5f22d11ca7`
- DB(machine-local): `apps/company-map/data/company-map.db` (SQLite, 워커가 쓰는 중이면 `database is locked` → `sqlite3 -cmd ".timeout 5000"`)

## 한 일

| 단계 | 상태 | 위치 |
|---|---|---|
| T를 날짜 카운트(`round+1`) → `누적 매수 체결액 ÷ 1회 매수액`으로 교체 | **커밋됨** `38ba886` | `src/lib/infinite-buy/strategy-v22.ts` T 산출부 |
| v2.2 LIVE 실행 전 `syncFills` 호출 | 커밋됨 `38ba886` | `src/lib/infinite-buy/run.ts` 상단 |
| `boughtAmountFromOrders` (마지막 `round 0` 거래일 이후만 집계) | 커밋됨 `38ba886` | `src/lib/infinite-buy/sync.ts` 하단 |
| `getOrders` 30일 윈도우 분할 순회 (67→171건) | 커밋됨 `38ba886` | `src/lib/toss/date-windows.ts`, `client.ts` |
| 진단·도해 문서 3건 | 커밋됨 `86815e7` | `docs/2026-09-08-…underinvestment.html`, `docs/2026-09-19-…rule-audit.html`, `docs/2026-09-19-…t-divergence-diagram.html` |
| **리셋 루프 버그 수정** | **미커밋 (워킹 트리)** | `strategy-v22.ts` 리셋 분기 + `strategy-v22.test.ts` 말미 `describe("… 리셋 직후 재시작")` 2개 |

### 리셋 루프 버그 (미커밋분의 이유)

`38ba886`에서 리셋 판정을 `s.round >= 1` → `T > 0`으로 바꿨는데, `boughtAmountFromOrders`의 사이클 경계는 "`round 0` **주문**의 거래일"이고 **리셋 날에는 주문을 내지 않는다**. 그래서 리셋 후에도 직전 사이클 체결액($3,153.44, T=15.77)이 남아 매번 리셋 분기에 걸려 `first_market`이 영영 나가지 않았다(9/22·9/23 이틀 매수 누락). 리셋 판정만 `s.round >= 1`로 되돌렸다. 변동식·전후반·소진 판정은 T 그대로. 테스트 409개 통과 확인(2026-09-23).

## 현재 상태 (2026-09-28 14:21 KST 확인)

- 브랜치 `fix/infinite-buy-v22-t-definition` (HEAD `86815e7`). **이 저장소는 그동안 master에 직접 커밋해 왔다** — 브랜치를 만든 건 내(에이전트) 판단이었고, master로 옮길지는 사용자가 아직 답하지 않았다.
- 워커: PID 31003/31007 (09-23 23:10:29 기동, 리셋 루프 수정 반영분) **하나만** 가동.
- 사이클: `round=3`, `last_run_date=2026-09-25`. 새 사이클은 9/23 `first_market` 2주 @$78.03로 시작, 9/24 `loc_var` 1주 @$78.58 체결.
- 신 코드 가동 증거: 9/24 `loc_var` 지정가가 $85.53 = `78.03 × (1+(10−0.78/2)%)` (소수 T 반영. 구 코드였다면 $85.44).

## 워킹 트리의 무관한 변경 — 커밋에 섞지 말 것

세션 시작 전부터 있던 변경이다. 사용자 소유.

- `apps/company-map/src/actions/infinite-buy.ts` — `updateCycle` 숫자 검증 hunk (내 hunk는 이미 `38ba886`에 `git apply --cached`로 분리해 커밋함)
- `DcaManager.tsx`, `InfiniteBuyManager.tsx`, `apps/blog-collection/**`, `.recall/**`, `dart.log`, `apps/api/data/**`, 다른 날짜의 `docs/*.html`

## 이미 틀렸던 길 (반복 금지)

- **워커 재시작 시 옛 프로세스가 남는다.** 두 번 연속 구 워커가 살아남아 먼저 실행했다(9/21, 9/23). `ps -eo pid,lstart,command | grep "[t]sx.*worker/index"`로 기동 시각을 소스 수정 시각과 대조할 것. 이 워커는 **SIGTERM을 무시**해 `kill -9`가 필요했다.
- **"submitted→filled 자동 채움"으로 신·구 코드를 판별할 수 없다.** `syncFillsFromToss`는 `filledQuantity <= 0`을 건너뛰어 미체결 주문은 신 코드에서도 `submitted`로 남는다. 판별은 주문 **지정가의 소수 T 반영 여부**로 할 것.
- **매도 체결가를 지정가로 가정하지 말 것.** LOC 매도는 종가로 체결된다. 이 가정으로 초판 실현손익을 −$36.24로 과대 계상했다(실제 −$1.69).
- 리셋 날 주문 0건은 **정상**이다(보유 0 확인 → `resetAfter`만). 버그로 오인하지 말 것.

## 남은 일

1. 리셋 루프 수정분 커밋 — **사용자가 아직 커밋을 요청하지 않았다.** CLAUDE.md상 명시 요청 없이 커밋 금지.
2. 브랜치: master로 옮길지 결정 (사용자 결정 대기).
3. `/ce-compound` — 사용자가 새 세션에서 돌려보겠다고 했음. 후보: 날짜 vs 체결 T 정의, 리셋 경계가 주문 존재에 의존하는 함정. 범용 패턴 2건은 이미 `~/.claude/CLAUDE.md` 패턴 섹션에 있으니 **중복 기재 금지**.
4. 모니터링: T가 20에 근접하면 매수가 `loc_avg`+`loc_var` 2건으로 유지되는지. 보유 4주 미만일 땐 `sell_loc_var`가 0주라 생략되는 게 정상.

## 알려진 미해결 한계 (손대지 않기로 한 것)

- v2.2 dryRun은 모의 체결을 기록하지 않아 `round` fallback을 쓴다(LIVE와 동작 다름).
- 매수·매도 LOC가 같은 가격 — V2.2 원문에 분리 규칙이 없어 유지(v4.0은 −$0.01 분리).
- `@@unique` 등 사이클 경계를 명시 컬럼으로 두는 개선은 하지 않았다(경계가 "round 0 주문 존재"에 의존).

## 먼저 읽을 것

- `docs/2026-09-19-infinite-buy-t-divergence-diagram.html` — 진단·실측·수정 내역 전체 (11~14장이 수정·검증)
- `docs/superpowers/specs/2026-07-07-infinite-buy-v2.2-reference.html` — 원전 T 정의 (`T = 누적 매수액 ÷ 1회 매수액`)
- `~/.claude/projects/-Users-dijer-dev-workspace-fullstack-turborepo-starter/memory/infinite-buy-v22-underinvestment.md` (machine-local)

## 도움 될 스킬

`compound-engineering:ce-compound`, `compound-engineering:ce-commit`, `superpowers:test-driven-development`
