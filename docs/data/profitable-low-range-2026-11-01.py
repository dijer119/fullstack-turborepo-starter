"""Public filing / 52-week range screen. Never persist authentication secrets."""

import argparse
import ast
import json
import math
import re
import sqlite3
import subprocess
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path('/Users/dijer/dev/workspace/fullstack-turborepo-starter')
DATA = ROOT / 'docs/data'
FIN = DATA / 'profitable-low-range-financials-2026-11-01.json'
PRICES = DATA / 'profitable-low-range-prices-2026-11-01.json'
RESULT = DATA / 'profitable-low-range-results-2026-11-01.json'
PERIODS = [(2025, '11014'), (2025, '11011'), (2026, '11013'), (2026, '11012'), (2026, '11014')]
OP_NAMES = {'영업이익', '영업이익(손실)'}
STOP = threading.Event()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def universe():
    db = sqlite3.connect('file:' + str(ROOT / 'apps/company-map/data/company-map.db') + '?mode=ro', uri=True)
    rows = db.execute('select code,name,corp_code,marcap from stock_masters where corp_code is not null order by code').fetchall()
    db.close()
    return [dict(zip(['code', 'name', 'corp_code', 'market_cap'], row)) for row in rows
            if re.fullmatch(r'\d{6}', row[0]) and not re.search(r'스팩|기업인수목적', row[1])]


def api_key():
    text = (ROOT / 'apps/company-map/.env.local').read_text()
    match = re.search(r'^DART_API_KEY\s*=\s*[\"\']?([a-zA-Z0-9]+)', text, re.M)
    if not match:
        raise RuntimeError('DART key missing from configured local connection')
    return match.group(1)


def fetch_batch(task, key):
    year, report, corps = task
    if STOP.is_set():
        return {'year': year, 'report': report, 'status': 'skipped_after_limit', 'rows': []}
    params = urlencode({'crtfc_key': key, 'corp_code': ','.join(corps), 'bsns_year': year, 'reprt_code': report})
    # URL including authentication is passed through stdin, never process arguments or saved output.
    config = 'url = "https://opendart.fss.or.kr/api/fnlttMultiAcnt.json?' + params + '"\n'
    for _ in range(2):
        result = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '40', '--config', '-'],
                                input=config, capture_output=True, text=True, timeout=45)
        if result.returncode:
            continue
        try:
            response = json.loads(result.stdout)
        except ValueError:
            continue
        status = response.get('status')
        if status in ['020', '021']:
            STOP.set()
        fields = ['stock_code', 'corp_code', 'rcept_no', 'bsns_year', 'reprt_code', 'account_nm', 'fs_div',
                  'sj_div', 'thstrm_dt', 'thstrm_amount', 'thstrm_add_amount', 'frmtrm_dt',
                  'frmtrm_amount', 'frmtrm_add_amount', 'currency']
        rows = [{field: row.get(field) for field in fields} for row in response.get('list', [])
                if row.get('account_nm') in OP_NAMES and row.get('sj_div') in ['IS', 'CIS']]
        return {'year': year, 'report': report, 'status': status, 'rows': rows, 'requested_corp_count': len(corps)}
    return {'year': year, 'report': report, 'status': 'transport_or_json_error', 'rows': [], 'requested_corp_count': len(corps)}


def fetch_financials():
    stocks = universe()
    corps = sorted({stock['corp_code'] for stock in stocks})
    tasks = [(year, report, corps[i:i+100]) for year, report in PERIODS for i in range(0, len(corps), 100)]
    key = api_key()
    batches = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        pending = [pool.submit(fetch_batch, task, key) for task in tasks]
        for job in as_completed(pending):
            batches.append(job.result())
            if len(batches) % 25 == 0:
                print('DART batches', len(batches), '/', len(tasks), flush=True)
    write(FIN, {'retrieved_at_utc': datetime.now(timezone.utc).isoformat(), 'universe': stocks,
                'requested_corp_count': len(corps), 'batches': batches})
    print('Financials saved; statuses:', dict(Counter(batch['status'] for batch in batches)), flush=True)


def amount(row, field):
    raw = row.get(field)
    if raw is None or str(raw).strip() in ['', '-']:
        raise ValueError('missing financial amount')
    return int(str(raw).replace(',', '').strip())


def financial_candidates():
    payload = json.loads(FIN.read_text())
    data = {}
    for batch in payload['batches']:
        if batch['status'] != '000':
            continue
        for row in batch['rows']:
            if not row['rcept_no'] or row['rcept_no'][:8] > '20261101':
                continue
            key = (row['stock_code'], batch['year'], batch['report'], row['fs_div'])
            old = data.get(key)
            if not old or row['rcept_no'] > old['rcept_no']:
                data[key] = row
    accepted, rejected = [], Counter()
    for stock in payload['universe']:
        code = stock['code']
        base = [(2025, '11014'), (2025, '11011'), (2026, '11013'), (2026, '11012')]
        latest_report = (2026, '11014')
        has_q3 = any((code, *latest_report, fs) in data for fs in ['CFS', 'OFS'])
        required = base + ([latest_report] if has_q3 else [])
        fs = next((f for f in ['CFS', 'OFS'] if all((code, y, p, f) in data for y, p in required)), None)
        if fs is None:
            rejected['incomplete_or_inconsistent_statements'] += 1
            continue
        if fs == 'OFS' and any((code, y, p, 'CFS') in data for y, p in required):
            rejected['partial_consolidated_history'] += 1
            continue
        selected = {(y, p): data[(code, y, p, fs)] for y, p in required}
        try:
            currency = {row['currency'] for row in selected.values()}
            if currency != {'KRW'}:
                rejected['non_KRW_or_unknown_currency'] += 1
                continue
            for (year, report), row in selected.items():
                dates = re.findall(r'\d{4}[.-]\d{2}[.-]\d{2}', row['thstrm_dt'] or '')
                expected = f'{year}.' + {'11011': '12.31', '11013': '03.31', '11012': '06.30', '11014': '09.30'}[report]
                if not dates or dates[-1].replace('-', '.') != expected:
                    raise ValueError('non-calendar fiscal year or period mismatch')
                prior_dates = re.findall(r'\d{4}[.-]\d{2}[.-]\d{2}', row['frmtrm_dt'] or '')
                prior_expected = str(year-1) + expected[4:]
                if not prior_dates or prior_dates[-1].replace('-', '.') != prior_expected:
                    raise ValueError('prior-year comparison period mismatch')
            q3 = selected[(2025, '11014')]
            annual = selected[(2025, '11011')]
            q1 = selected[(2026, '11013')]
            q2 = selected[(2026, '11012')]
            q4_now = amount(annual, 'thstrm_amount') - amount(q3, 'thstrm_add_amount')
            q4_prev = amount(annual, 'frmtrm_amount') - amount(q3, 'frmtrm_add_amount')
            quarters = [
                {'period': '2025Q3', 'value': amount(q3, 'thstrm_amount'), 'prior': amount(q3, 'frmtrm_amount')},
                {'period': '2025Q4', 'value': q4_now, 'prior': q4_prev},
                {'period': '2026Q1', 'value': amount(q1, 'thstrm_amount'), 'prior': amount(q1, 'frmtrm_amount')},
                {'period': '2026Q2', 'value': amount(q2, 'thstrm_amount'), 'prior': amount(q2, 'frmtrm_amount')},
            ]
            if has_q3:
                latest = selected[latest_report]
                quarters = quarters[1:] + [{'period': '2026Q3', 'value': amount(latest, 'thstrm_amount'), 'prior': amount(latest, 'frmtrm_amount')}]
            total = sum(q['value'] for q in quarters)
            prior = sum(q['prior'] for q in quarters)
            if not all(q['value'] > 0 for q in quarters):
                rejected['not_four_positive_quarters'] += 1
                continue
            if prior <= 0 or total < prior:
                rejected['trailing_total_not_positive_growth_base'] += 1
                continue
            if quarters[-1]['prior'] <= 0 or quarters[-1]['value'] < quarters[-1]['prior']:
                rejected['latest_quarter_not_positive_growth_base'] += 1
                continue
            # Verify half-year accumulated operating income against Q1+Q2.
            assert abs(amount(q1, 'thstrm_amount') + amount(q2, 'thstrm_amount') - amount(q2, 'thstrm_add_amount')) <= 2
            accepted.append({**stock, 'fs_div': fs, 'quarters': quarters, 'trailing_op': total,
                             'trailing_prior_op': prior, 'trailing_yoy_pct': (total/prior-1)*100,
                             'latest_yoy_pct': (quarters[-1]['value']/quarters[-1]['prior']-1)*100,
                             'reports': list(selected.values())})
        except (ValueError, AssertionError):
            rejected['amount_period_or_accumulation_mismatch'] += 1
    return accepted, dict(rejected)


def price_url(code):
    return f'https://api.finance.naver.com/siseJson.naver?symbol={code}&requestType=1&startTime=20251031&endTime=20261030&timeframe=day'


def fetch_price(stock):
    for _ in range(2):
        result = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '30', price_url(stock['code'])],
                                text=True, capture_output=True, timeout=35)
        try:
            if result.returncode:
                continue
            rows = ast.literal_eval(result.stdout.strip())[1:]
            assert rows and rows[0][0] <= '20251103' and rows[-1][0] == '20261030'
            assert len(rows) >= 230
            valid = []
            for row in rows:
                _, op, high, low, close, volume, *_ = row
                assert all(isinstance(v, (int, float)) and math.isfinite(v) for v in [op, high, low, close, volume])
                if min(op, high, low, close) <= 0 or volume <= 0:
                    continue
                assert low <= min(op, close) <= max(op, close) <= high
                valid.append(row)
            assert len(valid) >= 230 and valid[-1][0] == '20261030'
            return {'code': stock['code'], 'source': price_url(stock['code']), 'rows': rows, 'valid_days': len(valid)}
        except (ValueError, SyntaxError, AssertionError, TypeError):
            continue
    return {'code': stock['code'], 'error': 'incomplete_year_or_invalid_OHLC_or_transport'}


def fetch_prices():
    stocks, exclusions = financial_candidates()
    records = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        pending = [pool.submit(fetch_price, stock) for stock in stocks]
        for task in as_completed(pending):
            records.append(task.result())
            if len(records) % 100 == 0:
                print('Price series', len(records), '/', len(stocks), flush=True)
    write(PRICES, {'retrieved_at_utc': datetime.now(timezone.utc).isoformat(), 'financial_candidates': len(stocks),
                   'financial_exclusions': exclusions, 'records': sorted(records, key=lambda r:r['code'])})
    print('Price records', len(records), 'errors', sum('error' in r for r in records), flush=True)


def analyze():
    stocks, exclusions = financial_candidates()
    prices = json.loads(PRICES.read_text())
    indexed = {r['code']: r for r in prices['records'] if 'error' not in r}
    ranked = []
    for stock in stocks:
        record = indexed.get(stock['code'])
        if not record:
            continue
        rows = [r for r in record['rows'] if min(r[1:5]) > 0 and r[5] > 0]
        high = max(r[2] for r in rows)
        low = min(r[3] for r in rows)
        closes = [r[4] for r in rows]
        recent = rows[-20:]
        ranked.append({**stock, 'high52': high, 'low52': low, 'range_pct': (high/low-1)*100,
                       'last_close': closes[-1], 'price_return_pct': (closes[-1]/closes[0]-1)*100,
                       'valid_days': len(rows), 'zero_or_invalid_days': len(record['rows'])-len(rows),
                       'high_dates': [r[0] for r in rows if r[2] == high], 'low_dates': [r[0] for r in rows if r[3] == low],
                       'average_value_estimate_20d': sum(r[4]*r[5] for r in recent)/len(recent),
                       'price_source': record['source']})
    ranked.sort(key=lambda r:(r['range_pct'], -r['average_value_estimate_20d'], r['code']))
    strict = []
    for i, stock in enumerate(ranked, 1):
        stock['rank'] = i
        stock['growth_quarters_count'] = sum(q['prior'] > 0 and q['value'] >= q['prior'] for q in stock['quarters'])
        stock['all_four_yoy_growth'] = stock['growth_quarters_count'] == 4
        if stock['all_four_yoy_growth']:
            strict.append(stock)
            stock['strict_rank'] = len(strict)
    write(RESULT, {'asof': '2026-10-30', 'financial_basis': 'latest available periodic filing; preliminary announcements excluded',
                   'criteria': 'four positive individual quarters; positive prior TTM and latest prior quarter; TTM and latest quarter YoY >= 0; same CFS/OFS; calendar fiscal year; KRW',
                   'financial_candidates': len(stocks), 'financial_exclusions': exclusions,
                   'valid_price_count': len(ranked), 'strict_count': len(strict), 'selected_mode': 'four_positive_and_each_quarter_yoy_non_decreasing',
                   'selected_top20_codes': [r['code'] for r in strict[:20]],
                   'price_errors': [r for r in prices['records'] if 'error' in r], 'results': ranked})
    print('ELIGIBLE', len(stocks), 'VALID PRICE', len(ranked), 'EXCLUSIONS', exclusions)
    for r in ranked[:30]:
        print(r['rank'],r['code'],r['name'],f"range={r['range_pct']:.2f}%",'quarters',[q['period']+':'+str(round(q['value']/1e8,2)) for q in r['quarters']],f"TTM_YoY={r['trailing_yoy_pct']:.2f}%",f"latest_YoY={r['latest_yoy_pct']:.2f}%")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['financials', 'prices', 'analyze'])
    action = parser.parse_args().action
    {'financials': fetch_financials, 'prices': fetch_prices, 'analyze': analyze}[action]()
