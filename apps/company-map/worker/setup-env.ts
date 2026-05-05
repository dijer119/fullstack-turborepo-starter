import { config } from "dotenv";
import path from "node:path";

// Load .env.local first (higher priority), then .env. This file is
// imported as the very first statement of worker/index.ts so the
// environment is populated before any other module reads process.env.
config({ path: path.resolve(__dirname, "..", ".env.local") });
config({ path: path.resolve(__dirname, "..", ".env") });
