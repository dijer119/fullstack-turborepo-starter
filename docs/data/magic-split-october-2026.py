"""Reproducible, daily-close research model; not a live-trading backtest."""

import argparse
import ast
import json
import math
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UNIVERSE = ROOT / "magic-split-one-month-screen-2026-10-30.json"
PRICES = ROOT / "magic-split-october-2026-prices.json"
RESULTS = ROOT / "magic-split-october-2026-results.json"
FEE = 0.00014
TAX = 0.002
CAPITAL = 10_000_000
BUDGET = 1_000_000


def source_url(code):
    return (
        "https://api.finance.naver.com/siseJson.naver?"
        f"symbol={code}&requestType=1&startTime=20260930"
        "&endTime=20261030&timeframe=day"
    )


def get_prices(item):
    code = item["code"]
    assert len(code) == 6 and code.isdigit()
    error = ""
    for _ in range(2):
        try:
            response = subprocess.run(
                ["curl", "--fail", "--silent", "--show-error", "--max-time", "20", source_url(code)],
                capture_output=True, text=True, check=True, timeout=25,
            )
            rows = ast.literal_eval(response.stdout.strip())[1:]
            assert rows and rows[0][0] == "20260930"
            month = [r for r in rows if "20261001" <= r[0] <= "20261030"]
            assert len(month) == 20 and month[-1][0] == "20261030"
            assert len({r[0] for r in month}) == len(month)
            for r in rows:
                _, op, hi, lo, cl, volume, *_ = r
                assert all(isinstance(v, (int, float)) and math.isfinite(v) for v in [op, hi, lo, cl, volume])
                assert 0 < lo <= min(op, cl) <= max(op, cl) <= hi and volume > 0
            return {"code": code, "name": item["name"], "source": source_url(code), "rows": rows}
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
    return {"code": code, "name": item["name"], "error": error}


def fetch():
    universe = json.loads(UNIVERSE.read_text())["all_valid_metrics"]
    records = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        pending = [pool.submit(get_prices, item) for item in universe]
        for task in as_completed(pending):
            records.append(task.result())
            if len(records) % 100 == 0:
                print(f"Fetched {len(records)}/{len(universe)}", flush=True)
    payload = {
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "universe_source": UNIVERSE.name,
        "universe_count": len(universe),
        "records": sorted(records, key=lambda x: x["code"]),
    }
    PRICES.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print("Price records:", len(records), "Errors:", sum("error" in r for r in records), flush=True)


def simulate(record, drop=5, profit=3, friction=0):
    """Observe Oct 1 open, then daily closes. Sell first; at most one buy per observation."""
    rows = [r for r in record["rows"] if r[0] >= "20261001"]
    observations = [(rows[0][0] + "-open", rows[0][1])]
    observations.extend((r[0] + "-close", r[4]) for r in rows)
    cash = float(CAPITAL)
    held = []
    trades = []
    realized = 0.0
    peak = float(CAPITAL)
    drawdown = 0.0
    max_cost = 0.0
    max_slot = 0
    buys = 0
    sells = 0
    curve = []
    for stamp, reference in observations:
        # Slippage sensitivity uses the quoted reference for triggers and adverse prices for fills.
        sold = [lot for lot in held if reference + 1e-8 >= lot["price"] * (1 + profit / 100)]
        if sold:
            for lot in sold:
                fill = reference * (1 - friction)
                proceeds = lot["qty"] * fill * (1 - FEE - TAX)
                gain = proceeds - lot["cost"]
                cash += proceeds
                realized += gain
                sells += 1
                trades.append({"date": stamp, "side": "sell", "slot": lot["slot"], "price": fill, "qty": lot["qty"], "pnl": gain})
                held.remove(lot)
        else:
            slot = 1 if not held else None
            if held:
                slots = {lot["slot"] for lot in held}
                for lot in sorted(held, key=lambda x: x["slot"]):
                    if lot["slot"] < 8 and lot["slot"] + 1 not in slots and reference <= lot["price"] * (1 - drop / 100) + 1e-8:
                        slot = lot["slot"] + 1
                        break
            if slot is not None:
                fill = reference * (1 + friction)
                qty = math.floor(min(BUDGET, cash) / (fill * (1 + FEE)))
                if qty > 0:
                    cost = qty * fill * (1 + FEE)
                    held.append({"slot": slot, "price": fill, "qty": qty, "cost": cost})
                    cash -= cost
                    buys += 1
                    max_slot = max(max_slot, slot)
                    trades.append({"date": stamp, "side": "buy", "slot": slot, "price": fill, "qty": qty, "cost": cost})
        exposure = sum(lot["cost"] for lot in held)
        max_cost = max(max_cost, exposure)
        equity = cash + sum(lot["qty"] * reference * (1 - friction) * (1 - FEE - TAX) for lot in held)
        peak = max(peak, equity)
        drawdown = min(drawdown, equity / peak - 1)
        assert cash >= -0.001 and exposure <= 8 * BUDGET + 0.001
        assert len({lot["slot"] for lot in held}) == len(held)
        curve.append({"date": stamp, "price": reference, "equity": equity})
    qty = sum(lot["qty"] for lot in held)
    ending_cost = sum(lot["cost"] for lot in held)
    ending_value = qty * rows[-1][4] * (1 - friction) * (1 - FEE - TAX)
    pnl = equity - CAPITAL
    unrealized = ending_value - ending_cost
    assert abs(realized + unrealized - pnl) < 0.001
    return {
        "return_pct": pnl / CAPITAL * 100, "pnl": pnl,
        "realized_pnl": realized, "unrealized_net_pnl": unrealized,
        "cash": cash, "ending_qty": qty, "max_slot": max_slot,
        "buys": buys, "sells": sells, "drawdown_pct": drawdown * 100,
        "max_invested": max_cost, "trades": trades, "curve": curve,
    }


def simulate_path(record, order="OLHC", drop=5, profit=3, friction=0):
    """Two hypothetical monotone OHLC paths; thresholds fill along each segment.

    A flat strategy restarts only at the next day's open. This avoids inventing
    repeated intraday restarts from daily bars. Paths are scenarios, not bounds.
    """
    rows = [r for r in record["rows"] if r[0] >= "20261001"]
    cash, realized = float(CAPITAL), 0.0
    peak, drawdown = float(CAPITAL), 0.0
    held, trades, curve = [], [], []
    max_cost = max_slot = buys = sells = 0

    def mark(price):
        nonlocal peak, drawdown, max_cost
        equity = cash + sum(lot["qty"] * price * (1-friction) * (1-FEE-TAX) for lot in held)
        peak = max(peak, equity)
        drawdown = min(drawdown, equity/peak-1)
        exposure = sum(lot["cost"] for lot in held)
        max_cost = max(max_cost, exposure)
        assert cash >= -0.001 and exposure <= 8*BUDGET+0.001
        assert len(held) == len({lot["slot"] for lot in held})
        return equity

    def buy(slot, quoted, stamp):
        nonlocal cash, buys, max_slot
        fill = quoted*(1+friction)
        qty = math.floor(min(BUDGET, cash)/(fill*(1+FEE)))
        if qty < 1:
            return False
        cost = qty*fill*(1+FEE)
        cash -= cost
        held.append({"slot": slot, "price": fill, "qty": qty, "cost": cost})
        buys += 1
        max_slot = max(max_slot, slot)
        trades.append({"date": stamp, "side": "buy", "slot": slot, "price": fill, "qty": qty, "cost": cost})
        mark(quoted)
        return True

    def sell(lot, quoted, stamp):
        nonlocal cash, sells, realized
        fill = quoted*(1-friction)
        proceeds = lot["qty"]*fill*(1-FEE-TAX)
        gain = proceeds-lot["cost"]
        cash += proceeds
        realized += gain
        sells += 1
        held.remove(lot)
        trades.append({"date": stamp, "side": "sell", "slot": lot["slot"], "price": fill, "qty": lot["qty"], "pnl": gain})
        mark(quoted)

    def candidates():
        slots = {lot["slot"] for lot in held}
        return [(lot["price"]*(1-drop/100), lot["slot"]+1) for lot in held if lot["slot"] < 8 and lot["slot"]+1 not in slots]

    for row in rows:
        date, op, hi, lo, cl = row[:5]
        was_flat = not held
        mark(op)
        sold_at_open = False
        for lot in list(held):
            if op+1e-8 >= lot["price"]*(1+profit/100):
                sell(lot, op, date+"-open")
                sold_at_open = True
        if was_flat:
            buy(1, op, date+"-open")
        elif not sold_at_open:
            triggered = [(price, slot) for price, slot in candidates() if op <= price+1e-8]
            if triggered:
                price, slot = max(triggered)
                buy(slot, op, date+"-open")
        values = {"O": op, "H": hi, "L": lo, "C": cl}
        points = [values[x] for x in order]
        for segment, (start, end) in enumerate(zip(points, points[1:])):
            stamp = date+f"-segment{segment+1}"
            if end > start:
                targets = sorted([(lot["price"]*(1+profit/100), lot) for lot in held], key=lambda v:v[0])
                for target, lot in targets:
                    if start-1e-8 <= target <= end+1e-8:
                        sell(lot, target, stamp)
            elif end < start:
                cursor = start
                for _ in range(8):
                    triggered = [(min(price, cursor), slot) for price, slot in candidates() if end <= price+1e-8]
                    if not triggered:
                        break
                    price, slot = max(triggered)
                    if not buy(slot, price, stamp):
                        break
                    cursor = price
            mark(end)
        equity = mark(cl)
        curve.append({"date": date, "equity": equity, "price": cl})
    ending_qty = sum(lot["qty"] for lot in held)
    ending_cost = sum(lot["cost"] for lot in held)
    unrealized = ending_qty*rows[-1][4]*(1-friction)*(1-FEE-TAX)-ending_cost
    pnl = equity-CAPITAL
    assert abs(realized+unrealized-pnl) < .001
    return {"return_pct": pnl/CAPITAL*100, "pnl": pnl, "realized_pnl": realized,
            "unrealized_net_pnl": unrealized, "cash": cash, "ending_qty": ending_qty,
            "max_slot": max_slot, "buys": buys, "sells": sells,
            "drawdown_pct": drawdown*100, "max_invested": max_cost,
            "trades": trades, "curve": curve}


def cap_sale_gains(trades):
    """Haircut fixed trades' sale prices above gross +3%; not new executions."""
    held, haircut = {}, 0.0
    for trade in trades:
        if trade["side"] == "buy":
            held[trade["slot"]] = trade
        else:
            lot = held.pop(trade["slot"])
            capped = min(trade["price"], lot["price"]*1.03)
            haircut += (trade["price"]-capped)*trade["qty"]*(1-FEE-TAX)
    return haircut


def analyze():
    payload = json.loads(PRICES.read_text())
    records = [r for r in payload["records"] if "error" not in r]
    results = []
    for record in records:
        prev = next(r for r in record["rows"] if r[0] == "20260930")[4]
        last = record["rows"][-1][4]
        month = [r for r in record["rows"] if r[0] >= "20261001"]
        paths = {order: simulate_path(record, order) for order in ["OLHC", "OHLC"]}
        baseline = min(paths.values(), key=lambda x:x["return_pct"])
        sensitivity = [min(simulate_path(record, order, d, p)["return_pct"] for order in ["OLHC", "OHLC"]) for d in [4, 5, 6] for p in [2, 3, 4]]
        results.append({
            "code": record["code"], "name": record["name"], "source": record["source"],
            "monthly_price_return_pct": (last / prev - 1) * 100,
            "prev_close": prev, "last_close": last,
            "first_open": month[0][1],
            "estimated_avg_daily_value": sum(r[4] * r[5] for r in month) / len(month),
            "baseline": baseline,
            "path_results": paths,
            "close_only": simulate(record),
            "fixed_trade_gains_capped_return_pct": min((b["pnl"]-cap_sale_gains(b["trades"]))/CAPITAL*100 for b in paths.values()),
            "sensitivity_min_pct": min(sensitivity), "sensitivity_max_pct": max(sensitivity),
            "sensitivity_positive_count": sum(v > 0 for v in sensitivity),
            "slippage_0_1pct_per_side_return": min(simulate_path(record, order, friction=.001)["return_pct"] for order in ["OLHC", "OHLC"]),
        })
    results.sort(key=lambda r: (-r["baseline"]["return_pct"], r["code"]))
    for rank, result in enumerate(results, 1):
        result["rank"] = rank
    output = {
        "method": "Hypothetical O-L-H-C and O-H-L-C daily paths; monotone segments, threshold fills, gaps fill at open, flat restart next day open; 10m total, 1m per tranche, 8 tranches, drop5%, gross price profit3%, 0.014% fee each side, 0.20% sell tax; net liquidation at month end; lower of TWO scenarios (not a guaranteed bound); no subscription/dividend/cash interest/tick size/latency/order fills.",
        "universe_count": payload["universe_count"], "valid_count": len(results),
        "errors": [r for r in payload["records"] if "error" in r],
        "results": results,
    }
    RESULTS.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print("TOP 15 BY SPLIT MODEL")
    for r in results[:15]:
        b = r["baseline"]
        print(r["rank"], r["code"], r["name"], f"total={b['return_pct']:.4f}%", f"realized={b['realized_pnl']:.0f}", f"mtm={b['unrealized_net_pnl']:.0f}", f"sells={b['sells']}", f"slot={b['max_slot']}", f"monthly_price={r['monthly_price_return_pct']:.2f}%", f"slip={r['slippage_0_1pct_per_side_return']:.3f}%")
    print("PREVIOUS FIVE")
    for r in results:
        if r["code"] in ["005930", "105560", "012330", "033780", "271560"]:
            print(r["rank"], r["code"], r["name"], r["baseline"]["return_pct"], r["baseline"]["realized_pnl"], r["baseline"]["unrealized_net_pnl"])
    print("PRICE WINNER", max(results, key=lambda r: r["monthly_price_return_pct"])["name"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["fetch", "analyze"])
    args = parser.parse_args()
    {"fetch": fetch, "analyze": analyze}[args.action]()
