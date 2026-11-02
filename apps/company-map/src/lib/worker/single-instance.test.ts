import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import type { Server, AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { acquireWorkerLock } from "./single-instance";

const locks: Server[] = [];
const portOf = (lock: Server) => (lock.address() as AddressInfo).port;
const close = (lock: Server) => new Promise<void>((resolve) => lock.close(() => resolve()));

afterEach(async () => {
  await Promise.all(locks.splice(0).map(close));
});

describe("worker single instance", () => {
  it("rejects another worker while the first worker owns the lock", async () => {
    const first = await acquireWorkerLock(0);
    locks.push(first);
    await expect(acquireWorkerLock(portOf(first))).rejects.toThrow(/이미 실행 중|포트/);
    expect(first.listening).toBe(true);
  });

  it("allows exactly one simultaneous start after the previous worker exits", async () => {
    const previous = await acquireWorkerLock(0);
    const port = portOf(previous);
    await close(previous);
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () => acquireWorkerLock(port)),
    );
    for (const result of attempts) {
      if (result.status === "fulfilled") locks.push(result.value);
    }
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(3);
  });

  it("releases the OS lock even when its owner is forcibly terminated", async () => {
    const require = createRequire(import.meta.url);
    const modulePath = fileURLToPath(new URL("./single-instance.ts", import.meta.url));
    const child = spawn(process.execPath, [
      require.resolve("tsx/cli"), "--eval",
      `import { acquireWorkerLock } from ${JSON.stringify(modulePath)};
       acquireWorkerLock(0).then(lock => {
         console.log(JSON.stringify({ port: lock.address().port, pid: process.pid }));
         process.stdin.resume();
       });`,
    ], { stdio: ["pipe", "pipe", "pipe"] });
    try {
      const [data] = await once(child.stdout!, "data");
      const { port, pid } = JSON.parse(String(data).trim());
      expect(port).toBeGreaterThan(0);
      await expect(acquireWorkerLock(port)).rejects.toThrow();
      const exited = once(child, "exit");
      process.kill(pid, "SIGKILL");
      await exited;
      locks.push(await acquireWorkerLock(port));
    } finally {
      child.kill("SIGTERM");
    }
  });
});
