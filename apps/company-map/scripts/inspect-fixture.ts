import { readFileSync } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const fixDir = path.resolve(__dirname, "..", "tests", "fixtures");
const html = readFileSync(path.join(fixDir, "naver-main-005930.html"), "utf-8");
const $ = cheerio.load(html);

// Inspect financial table (table 4): col headers and EPS/BPS/PBR row values
const finTable = $("#content table.tb_type1.tb_num.tb_type1_ifrs").first();
console.log("Found financial table?", finTable.length);

// Show thead
const theadRows = finTable.find("thead tr");
console.log("\n=== THEAD ===");
theadRows.each((i, tr) => {
  const ths: string[] = [];
  $(tr).find("th").each((_, th) => {
    ths.push($(th).text().trim());
  });
  console.log(`  thead row ${i}: ${JSON.stringify(ths)}`);
});

console.log("\n=== EPS/BPS/PBR rows ===");
const tbodyRows = finTable.find("tbody > tr");
[10, 12, 13].forEach((rowIdx) => {
  const row = tbodyRows.eq(rowIdx - 1);
  const th = row.find("th").first().text().trim();
  const tds: string[] = [];
  row.find("td").each((_, td) => {
    tds.push($(td).text().trim().slice(0, 30));
  });
  console.log(`  row ${rowIdx} [${th}]: ${JSON.stringify(tds)}`);
});
