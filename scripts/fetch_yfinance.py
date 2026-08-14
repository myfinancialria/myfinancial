#!/usr/bin/env python3
"""
fetch_yfinance.py — the wide fundamentals layer, via the yfinance library.

Why Python here, in an otherwise Node repo: Yahoo's fundamentals endpoints
require a cookie + "crumb" handshake and block plain HTTP clients aggressively
(a direct Node implementation gets 429-ed for hours from a single address).
yfinance negotiates that handshake itself and, since 1.x, issues requests
through curl_cffi with a browser TLS fingerprint — which gets through where a
hand-rolled client does not.

What this adds on top of the Upstox filed layer:

  market cap          the real figure. It cannot be derived from filed
                      statements, which report no share count.
  industry            Yahoo's sub-sector inside the broad sector — e.g.
                      Energy → "Oil & Gas Refining & Marketing" — which is what
                      makes a like-for-like peer group possible.
  D/E, current ratio, PEG, P/S, EV/Revenue, forward P/E, beta, payout ratio,
  employees, business description, and the long tail of ratios Upstox omits.

Output is data/fundamentals_wide.json, in exactly the shape build_screener.mjs
already consumes. It is committed, so CI never needs to call Yahoo.

    python3 scripts/fetch_yfinance.py                 # whole universe, resumable
    python3 scripts/fetch_yfinance.py --limit 100
    python3 scripts/fetch_yfinance.py --liquid-first  # tradeable names first
    python3 scripts/fetch_yfinance.py --force         # ignore the cache
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    sys.exit("yfinance is not installed.  pip install -r requirements-data.txt")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = ROOT / "var" / "yfin"
SNAPSHOT = DATA / "fundamentals_wide.json"

# Results move on filing days, so a fortnight-old record is still current.
MAX_AGE_S = 14 * 24 * 3600


# ----------------------------------------------------------------------------
# shaping
# ----------------------------------------------------------------------------
def _num(x):
    """Keep only real, finite numbers — yfinance yields None, nan and strings."""
    if isinstance(x, bool) or x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v and v not in (float("inf"), float("-inf")) else None


def _pct(x):
    """A fraction (0.477) → a percentage (47.7)."""
    v = _num(x)
    return round(v * 100, 4) if v is not None else None


def _cr(x):
    """Rupees → ₹ crore."""
    v = _num(x)
    return round(v / 1e7, 2) if v is not None else None


def shape(info: dict) -> dict | None:
    """yfinance's ~166 loose keys → the fields the screener actually uses.

    Unit conventions verified against known values rather than assumed:
      dividendYield  ALREADY a percentage (ITC 5.59, not 0.0559)
      debtToEquity   a percentage (TCS 10.211 → 0.10x)
      returnOnEquity a fraction (TCS 0.47743 → 47.7%)
      marketCap      rupees
    """
    if not info or not isinstance(info, dict):
        return None
    # A symbol Yahoo does not really cover comes back as a near-empty stub.
    if not info.get("marketCap") and not info.get("trailingPE") and not info.get("sector"):
        return None

    revenue = _num(info.get("totalRevenue"))
    ebitda = _num(info.get("ebitda"))
    de = _num(info.get("debtToEquity"))
    dy = _num(info.get("dividendYield"))

    return {
        "longName": info.get("longName") or info.get("shortName"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "description": info.get("longBusinessSummary"),
        "employees": _num(info.get("fullTimeEmployees")),
        "website": info.get("website"),

        "marketCapCr": _cr(info.get("marketCap")),
        "enterpriseValueCr": _cr(info.get("enterpriseValue")),
        "sharesOutstanding": _num(info.get("sharesOutstanding")),
        "floatShares": _num(info.get("floatShares")),

        "pe": _num(info.get("trailingPE")),
        "forwardPe": _num(info.get("forwardPE")),
        "pb": _num(info.get("priceToBook")),
        "pegRatio": _num(info.get("trailingPegRatio") or info.get("pegRatio")),
        "priceToSales": _num(info.get("priceToSalesTrailing12Months")),
        "evEbitda": _num(info.get("enterpriseToEbitda")),
        "evRevenue": _num(info.get("enterpriseToRevenue")),

        "roe": _pct(info.get("returnOnEquity")),
        "roa": _pct(info.get("returnOnAssets")),
        "profitMarginPct": _pct(info.get("profitMargins")),
        "operatingMarginPct": _pct(info.get("operatingMargins")),
        "grossMarginPct": _pct(info.get("grossMargins")),
        "ebitdaMarginPct": round(ebitda / revenue * 100, 2) if revenue and ebitda is not None else None,

        # yfinance reports debt/equity as a percentage for Indian listings
        "debtToEquity": round(de / 100, 4) if de is not None else None,
        "currentRatio": _num(info.get("currentRatio")),
        "quickRatio": _num(info.get("quickRatio")),
        "totalDebtCr": _cr(info.get("totalDebt")),
        "totalCashCr": _cr(info.get("totalCash")),

        "revenueCr": _cr(info.get("totalRevenue")),
        "ebitdaCr": _cr(info.get("ebitda")),
        "freeCashflowCr": _cr(info.get("freeCashflow")),
        "operatingCashflowCr": _cr(info.get("operatingCashflow")),
        "revenueGrowthPct": _pct(info.get("revenueGrowth")),
        "earningsGrowthPct": _pct(info.get("earningsGrowth")),

        "eps": _num(info.get("trailingEps")),
        "bookValue": _num(info.get("bookValue")),
        # already a percentage — do NOT multiply
        "dividendYieldPct": round(dy, 3) if dy is not None else None,
        "dividendRate": _num(info.get("dividendRate")),
        "payoutRatioPct": _pct(info.get("payoutRatio")),

        "promoterHoldingPct": _pct(info.get("heldPercentInsiders")),
        "institutionHoldingPct": _pct(info.get("heldPercentInstitutions")),
        "beta": _num(info.get("beta")),
    }


# ----------------------------------------------------------------------------
# fetching
# ----------------------------------------------------------------------------
_print_lock = threading.Lock()
_counts = {"ok": 0, "empty": 0, "error": 0}


def cache_path(symbol: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "._-&" else "_" for c in symbol)
    return CACHE / f"{safe}.json"


def cached(symbol: str, max_age: float) -> dict | None | str:
    p = cache_path(symbol)
    try:
        if time.time() - p.stat().st_mtime > max_age:
            return "stale"
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return "stale"


def fetch_one(symbol: str, retries: int = 2) -> dict | None:
    """Fetch and shape one symbol. Returns None when Yahoo has no real data."""
    for attempt in range(retries + 1):
        try:
            info = yf.Ticker(f"{symbol}.NS").info
            return shape(info)
        except Exception:                                   # noqa: BLE001
            if attempt == retries:
                raise
            # jittered backoff: a burst of identical retries just re-triggers
            # whatever rate limiter refused the first call
            time.sleep((2 ** attempt) * 1.5 + random.random())
    return None


def worker(symbol: str, max_age: float, pause: float) -> tuple[str, dict | None, str]:
    hit = cached(symbol, max_age)
    if hit != "stale":
        return symbol, hit, "cache"
    try:
        rec = fetch_one(symbol)
        cache_path(symbol).write_text(json.dumps(rec))
        time.sleep(pause + random.random() * pause)
        return symbol, rec, "ok" if rec else "empty"
    except Exception as exc:                                # noqa: BLE001
        return symbol, None, f"error:{type(exc).__name__}"


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=0, help="only this many symbols")
    ap.add_argument("--workers", type=int, default=6, help="concurrent requests")
    ap.add_argument("--pause", type=float, default=0.25, help="seconds between calls per worker")
    ap.add_argument("--force", action="store_true", help="ignore the cache")
    ap.add_argument("--liquid-first", action="store_true",
                    help="order by rupee turnover so the tradeable names land first")
    ap.add_argument("--only-missing", action="store_true",
                    help="skip anything the committed snapshot already covers (what CI wants)")
    ap.add_argument("--refresh-oldest", type=int, default=0,
                    help="also re-fetch the N stalest cached records, so a daily run rotates "
                         "through the whole universe instead of freezing it")
    args = ap.parse_args()

    uni_file = DATA / "nse_universe.json"
    if not uni_file.exists():
        return print("data/nse_universe.json missing — run: npm run data:universe") or 1
    symbols = [s["symbol"] for s in json.loads(uni_file.read_text())["symbols"]]
    universe_size = len(symbols)          # --limit must not distort the reported coverage
    all_symbols = list(symbols)           # rotation works over the whole universe

    # Fetching in liquidity order means an interrupted run still leaves the
    # part of the market anyone would actually screen fully covered.
    if args.liquid_first:
        idx_file = ROOT / "dist" / "data" / "stocks.json"
        if idx_file.exists():
            idx = json.loads(idx_file.read_text())
            f = {k: i for i, k in enumerate(idx["fields"])}
            turnover = {r[f["symbol"]]: (r[f["avgTurnoverCr"]] or 0) for r in idx["rows"]}
            symbols.sort(key=lambda s: -turnover.get(s, 0))
            print(f"[yf] ordered by turnover — most-traded first ({symbols[0]} … {symbols[-1]})")
        else:
            print("[yf] --liquid-first ignored: no screener index yet")

    if args.limit:
        symbols = symbols[: args.limit]

    CACHE.mkdir(parents=True, exist_ok=True)
    max_age = -1 if args.force else MAX_AGE_S

    # In CI the point is to close gaps, not to re-walk 2,000 companies that the
    # committed snapshot already covers — Yahoo throttles long runs anyway, so
    # the budget is better spent on what is actually missing.
    already = set()
    if args.only_missing and SNAPSHOT.exists():
        try:
            already = {k for k, v in json.loads(SNAPSHOT.read_text()).get("companies", {}).items() if v}
        except (OSError, ValueError):
            already = set()
        if already:
            before = len(symbols)
            symbols = [s for s in symbols if s not in already]
            print(f"[yf] --only-missing: {before - len(symbols)} already covered, {len(symbols)} to chase")

    todo = [s for s in symbols if cached(s, max_age) == "stale"]

    # --only-missing alone would freeze the snapshot: gaps get filled once and
    # nothing already covered is ever looked at again, so earnings per share and
    # book value drift further from reality every quarter. Rotating a slice of
    # the oldest records through each run means the whole universe refreshes on
    # a predictable cycle without ever asking Yahoo for two thousand symbols in
    # one go, which is what gets an address throttled.
    if args.refresh_oldest > 0:
        aged = []
        for sym in all_symbols:
            try:
                aged.append((cache_path(sym).stat().st_mtime, sym))
            except OSError:
                continue
        aged.sort()
        rotate = [sym for _, sym in aged[: args.refresh_oldest] if sym not in todo]
        if rotate:
            oldest_days = (time.time() - aged[0][0]) / 86400 if aged else 0
            print(f"[yf] rotating {len(rotate)} stalest records (oldest {oldest_days:.1f} days) "
                  f"— full cycle every ~{max(1, len(all_symbols) // max(1, args.refresh_oldest))} runs")
            for sym in rotate:
                cache_path(sym).unlink(missing_ok=True)   # force a re-fetch
            todo = todo + rotate
    print(f"[yf] {len(symbols)} companies · {len(symbols) - len(todo)} already cached · fetching {len(todo)}")

    started = time.time()
    done = 0
    if todo:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(worker, s, max_age, args.pause): s for s in todo}
            for fut in as_completed(futures):
                _sym, rec, status = fut.result()
                done += 1
                if status == "ok":
                    _counts["ok"] += 1
                elif status == "empty":
                    _counts["empty"] += 1
                elif status.startswith("error"):
                    _counts["error"] += 1
                if done % 25 == 0 or done == len(todo):
                    rate = done / max(1e-9, time.time() - started)
                    eta = (len(todo) - done) / rate if rate else 0
                    with _print_lock:
                        print(
                            f"\r[yf] {done}/{len(todo)} · with data {_counts['ok']} · "
                            f"no data {_counts['empty']} · errors {_counts['error']} · "
                            f"{rate * 60:.0f}/min · eta {eta / 60:.0f}m   ",
                            end="", flush=True,
                        )
        print()

    # ---- merge into the snapshot; never shrink it ---------------------------
    # The snapshot is committed, and this script also runs in CI where the cache
    # may be cold or Yahoo may throttle after a couple of hundred symbols. If it
    # rebuilt purely from local cache it would replace a full snapshot with a
    # partial one and silently drop coverage from the published site. So start
    # from whatever is already committed and only ever overwrite with fresher
    # records.
    companies: dict[str, dict] = {}
    inherited = 0
    if SNAPSHOT.exists():
        try:
            prev = json.loads(SNAPSHOT.read_text()).get("companies", {})
            if isinstance(prev, dict):
                companies.update({k: v for k, v in prev.items() if v})
                inherited = len(companies)
        except (OSError, ValueError):
            pass

    refreshed = 0
    for sym in symbols:
        try:
            rec = json.loads(cache_path(sym).read_text())
        except (OSError, ValueError):
            continue
        if rec:
            if sym not in companies:
                refreshed += 1
            companies[sym] = rec

    if inherited:
        print(f"[yf] merged: {inherited} already in the snapshot, {refreshed} newly covered")

    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.write_text(json.dumps({
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "Yahoo Finance via yfinance",
        "covered": len(companies),
        "universe": universe_size,
        "companies": companies,
    }))

    pct = len(companies) / max(1, universe_size) * 100
    print(f"[yf] snapshot: {len(companies)}/{universe_size} companies ({pct:.1f}%) → data/fundamentals_wide.json")
    if _counts["error"]:
        print(f"[yf] {_counts['error']} symbols errored — rerun to retry just those")
    print("[yf] next: npm run build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
