# ES Morning Prep

A single-page morning dashboard for an S&P 500 futures trader. It answers seven
questions in about thirty seconds:

- What can move ES today?
- Is the equity move broad and well-confirmed?
- What sectors are leading and lagging?
- Are rates, volatility and credit supportive or restrictive?
- Are major earnings affecting the index or a key sector?
- What is the overall regime and risk environment?

Every section follows **Data → Signal → Conclusion**: the underlying numbers are
shown, but the interpretation is done for you.

---

## Running it locally

```bash
npm install
npm run dev          # http://localhost:3000
```

`npm run dev` fetches a data snapshot first, then starts Next and refreshes the
snapshot every two minutes, so the page behaves the way the published site does.

Every source is keyless except FRED's credit spread, which needs a free key
(`fredaccount.stlouisfed.org/apikey`). Put it in `.env.local`:

```bash
FRED_API_KEY=your-key
```

Without it the credit row falls back to FRED's CSV export, which FRED throttles
aggressively, so expect it to show UNAVAILABLE some of the time.

| Script | What it does |
|---|---|
| `npm run dev` | Local dashboard, data refreshed every 2 minutes |
| `npm run data` | Fetch every source once and write `public/data/*.json` |
| `npm run build` | Static export to `out/` |
| `npm run preview` | Serve `out/` locally |
| `npm run typecheck` | `tsc --noEmit` |

`DATA_MODE=mock` forces simulated data for offline UI work. Any section serving
mock data is named in the header chip, so a partly-live page can't pass for a
fully live one.

---

## Hosting: GitHub Pages, free with no metering

The site is a **static export**. A scheduled GitHub Action fetches every source
once, writes the result to `public/data/dashboard.json`, builds the site, and
publishes it to GitHub Pages. Visitors download static files and never trigger a
fetch.

**Why it's built this way.** The first deployment ran on Netlify serverless
functions. Every open tab called two functions every 45 seconds, and a cold call
swept 500+ stock quotes, recomputing identical data for every viewer. That
exhausted the free credits. Precomputing once per refresh removes the per-viewer
cost entirely, so there is nothing left to meter.

| | |
|---|---|
| Refresh cadence | Every 5 min on weekdays; every 30 min on weekends |
| Cost | Free: Actions minutes are free for public repos, and Pages is free static hosting |
| Page load | Instant, served from GitHub's CDN, with the latest snapshot embedded in the HTML |
| Polling | The page checks for a newer snapshot every 60s (static file, no cost) |

Schedule and publishing live in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

### Resilience built into the workflow

- **Last known good.** Each run starts with no cache, so the data script reads
  the currently published snapshot first. Any provider that fails this run is
  carried forward from it, marked STALE with its original timestamp.
- **Never publishes an empty page.** If every provider fails and there is
  nothing to carry forward (e.g. a network problem on the runner), the job fails
  and the live site is left untouched.
- **Client-side ageing.** Freshness badges and the next-event countdown are
  recomputed against the viewer's clock, not trusted from generation time. If
  the refresh ever stops, cards degrade to DELAYED and then STALE, and a banner
  says the snapshot is old. A dead pipeline can't masquerade as live data.
- **Keepalive.** GitHub disables scheduled workflows in public repos after 60
  days without commits, and Pages deploys aren't commits. A weekly check commits
  a heartbeat file if the repo has been quiet for 45 days.

### One-time setup

1. Push the repo to GitHub as **public** (Pages on private repos needs a paid
   plan). The repo contains no secrets; keys live only in GitHub Secrets.
2. **Settings → Pages → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions:** add `FRED_API_KEY`
   (and optionally `ANTHROPIC_API_KEY`).
4. Run the workflow once from the Actions tab, or push to `main`.

### Limits worth knowing

- **Cadence is ~5 minutes, not seconds.** GitHub's scheduler can also start runs
  several minutes late under load; minutes are offset from :00 to reduce that.
  For a morning scan this rarely matters, and Yahoo's own CME quotes already lag
  10–30 minutes.
- Pages has a soft 100 GB/month bandwidth limit, which a personal dashboard
  won't approach.

---

## Architecture

```
scripts/
  build-data.ts        The only code that calls providers. Writes public/data/*.json
  dev.mjs              Local: refresh data every 2 min alongside `next dev`
app/
  page.tsx             Prerendered with the latest snapshot embedded
components/            One component per dashboard section + ui/ primitives
services/
  futures.ts breadth.ts sectors.ts rates.ts volatility.ts credit.ts
  calendar.ts earnings.ts     One adapter per domain, each returning Block<T>
  dashboard.ts                Parallel fan-out + score derivation
  mode.ts                     live | mock switch
  providers/                  Yahoo, Treasury, FRED, TradingEconomics, Nasdaq,
                              S&P 500 constituents, mock
lib/
  types.ts      Normalized internal contracts. The UI knows nothing else
  scoring.ts    All score/classification logic (no magic numbers)
  freshness.ts  Status from age; re-ages blocks against the viewer's clock
  cache.ts      TTL cache with last-known-good and failure backoff
  ai.ts         Anthropic calls, structured output, rule-based fallback
  format.ts     Eastern Time + number formatting
config/
  thresholds.ts   Every weight, threshold and refresh interval
  universe.ts     Breadth and earnings-relevance settings
.github/workflows/deploy.yml   Scheduled refresh + Pages deploy + keepalive
```

---

## Where the data comes from

All sources are refreshed together on each snapshot.

| Section | Source |
|---|---|
| ES / NQ / RTY | Yahoo Finance (`ES=F`, `NQ=F`, `RTY=F`) |
| VIX | Cboe `^VIX` via Yahoo |
| 10Y yield + session bp move | Cboe `^TNX` via Yahoo |
| 2Y yield, 2s10s | home.treasury.gov par yield curve (T-1) |
| HY credit spread | FRED API, `BAMLH0A0HYM2` (daily, T-1) |
| Breadth | **All ~503 S&P 500 constituents**, Yahoo 5-minute bars |
| Sector rotation | Sector + semiconductor ETFs via Yahoo |
| Economic calendar | tradingeconomics.com, US only, 2-star and above |
| Earnings + EPS surprise | api.nasdaq.com |
| S&P 500 membership | datahub constituents dataset |

**Breadth is genuinely computed, not proxied.** Every constituent's session VWAP
is derived from its own 5-minute bars (`Σ(typical price × volume) / Σ volume`);
%-above-VWAP and the advance/decline ratio come from the full index. The sweep
refuses to report below 90% coverage.

**Earnings selection** answers "what could move the S&P today": Nasdaq's
calendar is intersected with live S&P 500 membership, filtered to a $50B floor,
and ranked by market cap. HIGH is reserved for $300B+. It is deliberately not
"whatever is biggest today", since on a quiet week that could be a $70B REIT.
Revenue, guidance and margins aren't published by any keyless source, so those
rows are **omitted** rather than shown as N/A.

**Calendar importance** is not TradingEconomics' star rating. Everything 2-star
and above is shown, but HIGH is reserved for prints that actually move index
futures (CPI, PPI, PCE, payrolls, claims, Fed, GDP, retail sales, ISM/PMI,
long-end auctions). Otherwise a 3-star Existing Home Sales print would push the
day's event risk to HIGH, which no ES trader would agree with.

### Caveats

- **Yahoo is unofficial and unlicensed**: undocumented, rate-limited at their
  discretion, no SLA, not licensed for commercial use, and typically 10–30 min
  delayed on CME futures. Fine for a personal morning scan; not something to
  trade size against.
- **TradingEconomics is scraped**, since their guest API was discontinued. The
  parser is strict: if the markup changes it throws, and the card shows
  UNAVAILABLE (or the last good calendar, marked STALE) rather than an empty list.
- **Sector rotation has no day-over-day delta.** That needs yesterday's closing
  score persisted somewhere; there's nothing honest to compare against yet, so
  the line is hidden.

### Swapping in a paid feed

Each domain has exactly one place to wire a vendor: the corresponding function
in `services/providers/live.ts`. Implement the body and return the normalized
type from `lib/types.ts`. **No call site and no component changes.** A slot that
throws `NotConfiguredError` falls back to labelled mock; any other failure
propagates so the block degrades to STALE or UNAVAILABLE. A real outage is never
papered over with simulated data.

---

## Scoring

All of it lives in [`config/thresholds.ts`](config/thresholds.ts).
`lib/scoring.ts` reads that config and contains no constants of its own, so the
model can be re-tuned without touching logic.

| Score | Range | Driven by |
|---|---|---|
| **Market Stress** | 0 calm → 100 severe | VIX 40%, 10Y move 30%, HY spread 25%, 2s10s 5% (weights shown in the card) |
| **Breadth** | 0 → 100 | % above VWAP 40%, A/D 35%, RSP-vs-SPY 25% |
| **Sector Rotation** | 0 defensive → 100 risk-on | Weighted cyclical average minus defensive average |
| **Confirmation** | STRONG…DIVERGENT | Sign agreement across ES/NQ/RTY |
| **Event Risk** | LOW/MED/HIGH | Importance points plus a concentration bonus for clustered high-impact events |

If an input is unavailable, a composite renormalizes across the inputs it has,
and the card lists the weights actually used.

Two conventions:

- **2s10s is 10Y minus 2Y.** Positive is upward-sloping. It gets low weight
  deliberately, since it says little about today's ES tape.
- **Colour follows interpretation, not sign.** A −6bp move in the 10Y renders
  green because falling yields support equities.

These are decision-support heuristics, not calibrated models, and the UI says so.

---

## AI usage

AI is used for interpretation only. It never produces a market data point.

The model receives already-computed scores and classifications and phrases them.
Output is constrained by a JSON schema, the classification fields are overwritten
with our own values after the response, and the prompt forbids trade
recommendations.

With `ANTHROPIC_API_KEY` unset (locally or in GitHub Secrets), `ruleBasedRead()`
in `lib/scoring.ts` produces the same shape deterministically. The card is never
empty.

---

## Deliberately not included

Support/resistance and overnight high/low levels (handled on the charts),
McClellan/TRIN/additional breadth variants, full sector charts, the complete
economic and earnings calendars, and any second page. The dashboard is meant to
stay scannable in thirty seconds.
