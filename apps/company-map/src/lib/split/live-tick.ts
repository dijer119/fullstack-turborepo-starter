import type { PrismaClient } from "@prisma-clients/company-map";
import { runLiveStrategy, type LiveDeps } from "./live-run";

export async function splitLiveTick(db: PrismaClient, deps: LiveDeps) {
  const strategies = await db.splitLiveStrategy.findMany({
    select: { id: true },
    where: {
      OR: [
        { status: { in: ["active", "reserved"] } },
        { reservation: { is: { status: "waiting", expiresAt: { lte: deps.now() } } } },
        {
          orders: {
            some: {
              status: {
                in: [
                  "submitting",
                  "submit_unknown",
                  "submitted",
                  "cost_pending",
                  "blocked",
                  "closed",
                ],
              },
            },
          },
        },
      ],
    },
    orderBy: { lastCheckedAt: "asc" },
    take: 10,
  });
  let placed = 0,
    errors = 0;
  for (const s of strategies) {
    const result = await runLiveStrategy(db, deps, s.id);
    placed += result.placed;
    if ("error" in result && result.error) errors++;
  }
  return { checked: strategies.length, placed, errors };
}
