import { readFileSync } from "node:fs";
import path from "node:path";
import { parseNaverMain, parseTreasuryStock } from "../src/lib/stocks/naver-scraper";

const fixDir = path.resolve(__dirname, "..", "tests", "fixtures");
const main = readFileSync(path.join(fixDir, "naver-main-005930.html"), "utf-8");
const wise = readFileSync(path.join(fixDir, "naver-wisereport-005930.html"), "utf-8");
console.log("MAIN:", JSON.stringify(parseNaverMain(main), null, 2));
console.log("TREASURY:", parseTreasuryStock(wise));
