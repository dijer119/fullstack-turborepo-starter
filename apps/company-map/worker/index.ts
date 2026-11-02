import "./setup-env"; // MUST be the first import — populates process.env
import { acquireWorkerLock } from "../src/lib/worker/single-instance";

async function main() {
  // Keep this process-wide lock until exit, including while shutting down.
  await acquireWorkerLock();
  console.log(`[worker] single instance acquired (pid=${process.pid})`);
  await import("./runtime");
}

main().catch((error) => {
  console.error("[worker] startup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
