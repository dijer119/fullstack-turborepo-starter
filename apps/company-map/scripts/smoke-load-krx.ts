import { loadKrxStocks } from "../worker/load-krx";

(async () => {
  const n = await loadKrxStocks();
  console.log("loaded:", n);
  process.exit(0);
})();
