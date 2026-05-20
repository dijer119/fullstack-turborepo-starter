// Empty stub for vitest. `server-only` throws unconditionally at import time,
// blocking test discovery of any module that transitively imports `@/lib/db`.
// In Next.js the real package guards Server Components; tests don't run there.
export {};
