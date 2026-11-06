ALTER TABLE split_live_strategies ADD COLUMN reentryDropPct REAL CHECK (reentryDropPct > 0 AND reentryDropPct < 100);
ALTER TABLE split_live_orders ADD COLUMN lastSellFillPrice REAL;
ALTER TABLE split_live_orders ADD COLUMN reentryTarget REAL;

-- Only backfill fills whose final price is provable from the cumulative execution.
UPDATE split_live_orders SET lastSellFillPrice = CASE WHEN filledQty = 1 THEN filledAmount ELSE price END
WHERE side = 'SELL' AND filledQty > 0 AND filledAmount > 0
  AND (filledQty = 1 OR ROUND(filledQty * price, 4) = filledAmount);

-- A worker from before this migration must not submit an immediate reentry.
CREATE TRIGGER split_require_reentry_target BEFORE INSERT ON split_live_orders
WHEN NEW.side = 'BUY'
 AND (SELECT slot FROM split_live_lots WHERE id = NEW.lotId) = 1
 AND (SELECT reentryDropPct FROM split_live_strategies WHERE id = NEW.strategyId) IS NOT NULL
 AND EXISTS (SELECT 1 FROM split_live_lots WHERE strategyId = NEW.strategyId AND slot = 1 AND soldQty > 0)
 AND (NEW.reentryTarget IS NULL OR NEW.price > NEW.reentryTarget)
BEGIN
  SELECT RAISE(ABORT, '1차 재매수 조건을 확인할 수 없습니다. 워커 버전을 확인하세요.');
END;
