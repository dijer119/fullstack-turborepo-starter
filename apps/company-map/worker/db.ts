import { PrismaClient } from "@prisma/client";

/** Worker-only Prisma client. Avoids the `server-only` import in `src/lib/db.ts`
 *  which is reserved for Next.js server components / actions. */
export const db = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});
