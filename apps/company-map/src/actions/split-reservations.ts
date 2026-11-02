"use server";

import { db } from "@/lib/db";

export async function listSplitReservations() {
  const eventInclude = { reservation: { select: { strategy: { select: { name: true, symbol: true, market: true, accountSeq: true } } } } } as const;
  const [rows, executions, failures, history] = await Promise.all([
    db.splitBuyReservation.findMany({ where: { status: { in: ["waiting", "ordering"] } }, include: { strategy: { select: { name: true, symbol: true, market: true, accountSeq: true, status: true, lastCheckedAt: true, lastPrice: true, note: true } } }, orderBy: { createdAt: "desc" } }),
    db.splitReservationEvent.findMany({ where: { type: { in: ["ordering", "executed"] } }, include: eventInclude, orderBy: { createdAt: "desc" }, take: 200 }),
    db.splitReservationEvent.findMany({ where: { type: { in: ["failed", "expired"] } }, include: eventInclude, orderBy: { createdAt: "desc" }, take: 200 }),
    db.splitReservationEvent.findMany({ include: eventInclude, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const serializeEvents = (events: typeof history) => events.map(e => ({ ...e, createdAt: e.createdAt.toISOString(), expiresAt: e.expiresAt.toISOString() }));
  return {
    rows: rows.sort((a, b) => a.strategy.name.localeCompare(b.strategy.name, "ko")).map(r => ({ ...r,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), expiresAt: r.expiresAt.toISOString(),
      strategy: { ...r.strategy, lastCheckedAt: r.strategy.lastCheckedAt?.toISOString() ?? null },
    })),
    executions: serializeEvents(executions), failures: serializeEvents(failures), history: serializeEvents(history),
  };
}
