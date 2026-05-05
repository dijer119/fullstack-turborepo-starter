import "../worker/setup-env";
import { loadCorpCodeMap } from "../src/lib/dart/corp-code";

(async () => {
  console.log("DART_API_KEY present:", !!process.env.DART_API_KEY);
  const map = await loadCorpCodeMap();
  console.log("corp_code map size:", map.size);
  process.exit(0);
})();
