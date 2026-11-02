import { createServer, type Server } from "node:net";

// Shared by continuous and --once workers, including other checkouts on this host.
// The OS releases the lock on exit/SIGKILL, so no stale PID file needs deleting.
export const WORKER_LOCK_PORT = 13004;

export async function acquireWorkerLock(
  port = WORKER_LOCK_PORT,
): Promise<Server> {
  const lock = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    lock.once("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "EADDRINUSE"
        ? new Error(`company-map 워커가 이미 실행 중이거나 잠금 포트(${port})가 사용 중입니다. 중복 실행을 중단합니다.`)
        : error);
    });
    lock.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
  });
  lock.unref();
  return lock;
}
