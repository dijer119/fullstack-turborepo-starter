DROP TRIGGER split_require_reentry_target;
CREATE TRIGGER split_require_reentry_target BEFORE INSERT ON split_live_orders
WHEN NEW.side = 'BUY'
 AND (SELECT slot FROM split_live_lots WHERE id = NEW.lotId) = 1
 AND EXISTS (SELECT 1 FROM split_live_lots WHERE strategyId = NEW.strategyId AND slot = 1 AND boughtQty > 0)
 AND (NEW.reentryTarget IS NULL OR NEW.price > NEW.reentryTarget
   OR ((SELECT reentryDropPct FROM split_live_strategies WHERE id = NEW.strategyId) IS NULL
     AND NEW.price > (SELECT boughtAmount / boughtQty FROM split_live_lots WHERE strategyId = NEW.strategyId AND slot = 1 AND boughtQty > 0 ORDER BY generation DESC LIMIT 1)))
BEGIN
 SELECT RAISE(ABORT, '1차 재매수 기준 가격 미충족 또는 워커 버전 확인 필요');
END;
