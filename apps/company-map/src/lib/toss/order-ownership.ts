import { PrismaClient } from "@prisma-clients/company-map";

let client: PrismaClient | undefined;

export async function assertSymbolOwnership(
  db: PrismaClient,
  accountSeq: number,
  symbol: string,
  strategyId?: string,
) {
  const owner = await db.splitSymbolOwner.findUnique({
    where: { accountSeq_symbol: { accountSeq, symbol } },
  });
  if (owner && owner.strategyId !== strategyId)
    throw new Error("분할매매 실거래 전략이 관리하는 계좌·종목입니다.");
  if (strategyId) {
    const strategy = await db.splitLiveStrategy.findUnique({
      where: { id: strategyId },
    });
    if (
      !owner ||
      owner.strategyId !== strategyId ||
      !["active", "reserved"].includes(strategy?.status ?? "") ||
      process.env.SPLIT_LIVE_DISABLED === "1"
    )
      throw new Error("분할매매 신규 주문이 중지되었거나 소유권이 없습니다.");
  }
}

/** Next와 worker 양쪽에서 사용하므로 server-only 모듈을 참조하지 않는다. */
export async function checkBrokerOwnership(
  accountSeq: number,
  symbol: string,
  strategyId?: string,
) {
  client ??= new PrismaClient();
  await assertSymbolOwnership(client, accountSeq, symbol, strategyId);
}
