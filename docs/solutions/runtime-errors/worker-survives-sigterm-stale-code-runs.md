---
title: "company-map 워커는 SIGTERM으로 죽지 않는다 — 재시작 후에도 옛 코드 프로세스가 실주문을 낸다"
date: 2026-09-28
category: runtime-errors
module: company-map worker
problem_type: runtime_error
component: background_job
symptoms:
  - "재시작 후 ps에 tsx worker/index.ts 프로세스가 두 벌(부모+자식 쌍 2개) 보인다"
  - "kill <pid>(SIGTERM) 후에도 프로세스가 그대로 남는다"
  - "수정한 코드가 배포됐는데 실제 주문은 수정 전 로직으로 나간다(무한매수 v2.2 지정가가 옛 T 기준)"
  - "새 워커가 lastRunDate 가드에 걸려 그날 실행을 건너뛴다"
root_cause: logic_error
resolution_type: workflow_improvement
severity: high
tags: [worker, sigterm, graceful-shutdown, process-lifecycle, stale-code, infinite-buy, tsx]
---

# company-map 워커는 SIGTERM으로 죽지 않는다 — 재시작 후에도 옛 코드 프로세스가 실주문을 낸다

## Problem

`yarn workspace company-map worker`로 띄운 워커는 `kill`(SIGTERM)을 받아도 종료되지 않는다. 그래서 코드를 고치고 워커를 "재시작"하면 옛 프로세스와 새 프로세스가 함께 돌고, 먼저 폴링한 쪽이 그 거래일을 소진한다. 옛 쪽이 이기면 **수정 전 로직으로 LIVE 계좌에 실주문**이 나가고, 새 쪽은 `lastRunDate` 가드에 걸려 조용히 건너뛴다.

## Symptoms

- 2026-09-21: 무한매수 v2.2 T 정의를 고친 뒤 재시작했지만, 9/04에 기동한 옛 워커(PID 7760)가 살아 있었다. 그날 주문 지정가 $67.01은 옛 T(=round 31) 기준이었다.
- 2026-09-22: `kill 7760`을 보낸 뒤 재조회해도 7760이 그대로 있었다. `kill -9`로만 죽었다(부모 7751은 자식과 함께 사라짐).
- 2026-09-23: 리셋 루프 버그를 고치고 재시작했는데, 같은 일이 또 일어났다. 09-19에 기동한 워커(32274/32278, 버그 있는 코드)가 23:10에 새로 띄운 워커(31003/31007)와 함께 돌고 있었다. SIGTERM을 무시해 역시 `kill -9`가 필요했다.

## What Didn't Work

- **`kill <pid>`(SIGTERM)**: 두 번 모두 프로세스가 남았다. 아래 "Why This Works"가 원인이다.
- **재시작만 하고 확인 안 하기**: 사용자가 "재시작했다"고 한 두 번 모두 옛 프로세스가 남아 있었다. 새 워커를 띄우는 것이 옛 워커를 멈추지 않는다.
- **주문 status로 신·구 코드 판별**: "`submitted`가 `filled`로 자동으로 채워지면 신 코드"로 판단하려 했으나 틀렸다. `syncFillsFromToss`는 `filledQuantity <= 0`인 주문을 건너뛰므로(`apps/company-map/src/lib/infinite-buy/sync.ts`의 `if (to.filledQuantity <= 0) continue;`) 미체결 주문은 어느 코드든 `submitted`로 남는다.

## Solution

코드 변경은 하지 않았다. 재시작 절차로 해결했다(이 문서 작성 시점 기준 워커 종료 로직은 그대로다).

```bash
# 1) 떠 있는 워커와 기동 시각 확인
ps -eo pid,ppid,lstart,command | grep "[t]sx.*worker/index"

# 2) 옛 프로세스 강제 종료 — SIGTERM은 통하지 않는다
kill -9 <옛 자식 PID> <옛 부모 PID>

# 3) 한 벌만 남았는지 재확인한 뒤 새로 기동
```

새 워커가 수정본을 물었는지는 **기동 시각을 수정 파일의 mtime과 대조**해 확정한다.

```bash
stat -f "%Sm %N" -t "%Y-%m-%d %H:%M:%S" <수정한 파일들>   # 전부 워커 lstart보다 앞서야 함
```

이미 거래일을 옛 워커가 소진했다면 그날은 건너뛰어진다. 그날 다시 실행하려면 옛 워커를 죽인 **뒤에** 사이클의 `last_run_date`를 비운다(9/23에 이렇게 해서 23:25 폴에 정상 주문이 나갔다).

## Why This Works

원인은 `apps/company-map/worker/index.ts`의 시그널 처리와 루프 구조가 맞물린 데 있다.

- `index.ts:64-71`에서 `SIGINT`·`SIGTERM` 핸들러를 등록한다. Node는 해당 시그널에 리스너가 하나라도 있으면 **기본 종료 동작을 하지 않는다.** 핸들러는 `shuttingDown = true`만 세우고 `process.exit`를 부르지 않는다.
- 그 플래그를 보는 건 `backgroundUpdate()`의 `while (!shuttingDown)`(`index.ts:28`)뿐이다.
- 같은 프로세스에서 병렬로 도는 다섯 루프는 `index.ts:82-97`에서 시작되며, 전부 `while (true)` + `await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS))`다(`infinite-buy-loop.ts:14`, `dca-loop.ts:10`, `vr-loop.ts:10`, `price-change-loop.ts:19`, `etf-pdf-loop.ts:15`). 플래그를 보지 않고, `setTimeout`도 `unref`하지 않아 이벤트 루프를 계속 붙잡는다(`index.ts`의 `sleep`만 `unref`한다).

결국 SIGTERM은 메인 루프 하나만 멈추고 프로세스는 계속 살아서, 무한매수·DCA·VR 루프가 **옛 코드로 계속 실주문을 낸다.** SIGKILL은 핸들러를 거치지 않으므로 통한다.

## Prevention

- **재시작 = 확인 → `kill -9` → 확인 → 기동.** 새 워커를 띄우기 전에 `ps ... | grep "[t]sx.*worker/index"`로 기존 PID가 없는지 본다. 기대 개수는 부모+자식 **2개**다.
- **코드가 반영됐는지는 주문 status가 아니라 입력 대비 출력으로 판별한다.** 무한매수 v2.2라면 `loc_var`/`sell_loc_var` 지정가가 `평단 × (1 + (10 − T/2)%)`에 소수 T(=누적 매수 체결액 ÷ 1회 매수액)를 쓴 값인지 본다. 9/24에는 $85.53(T=0.78)로 신 코드, 옛 코드였다면 $85.44(T=1)였다.
- **근본 수정(미적용, 후보)**: 시그널 핸들러가 모든 루프가 공유하는 종료 신호를 세우고 각 루프가 대기 전후로 확인하게 하거나, 유예 시간 뒤 `process.exit`를 호출한다. 이중 기동 자체를 막으려면 pidfile·락 파일로 단일 인스턴스를 보장한다. 어느 쪽이든 실주문 루프가 있으므로 "주문 제출 중 종료"가 안전한지 먼저 확인해야 한다.

## Related Issues

- `docs/2026-09-28-infinite-buy-v22-handoff.md` — 이 문제가 무한매수 v2.2 수정 작업 중 두 번 발생한 맥락
- `docs/2026-09-19-infinite-buy-t-divergence-diagram.html` — 같은 기간의 T 정의 수정 내역
- 워커가 launchd·pm2 없이 터미널 자식으로만 사는 운용 특성은 사용자 전역 지침(`~/.claude/CLAUDE.md`, machine-local)의 "company-map 워커는 수동 프로세스" 항목에 따로 있다. 이 문서는 그와 반대 방향의 실패, 즉 **워커가 없어지는 게 아니라 안 없어지는** 경우를 다룬다.
