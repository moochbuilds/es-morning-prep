# ES Morning Prep

A market-environment interpreter for an intraday S&P 500 futures (ES) trader.
Within 30–60 seconds it should answer:

1. What are rates saying?
2. What is credit saying?
3. What is volatility saying?
4. How are equities positioned internally?
5. Do those markets agree or disagree?
6. What changed from the prior session?
7. What does that imply about the environment ES is trading in?

It provides **context, not trade signals**. Long/short decisions come from ES
price action at important locations; the dashboard only says how much
cross-market confirmation that price action has.

There are **no composite scores**. Each market is classified on three questions
— where is it, which way is it moving, and how unusual is that move against its
own history — and the classifications are then compared. When markets disagree,
the disagreement is reported, never averaged away.

---

## The page

| Row | Section | Answers |
|---|---|---|
| 1 | Header | Session state (open / pre-market / weekend / holiday), next trading session, ES/NQ/RTY, event risk |
| 2 | **Today's Read** + **Vital Signs** | Market backdrop, signal alignment, main tailwind/headwind/divergence, a ≤4-sentence explanation, ES context, what changed since the prior session |
| — | **Cross-market divergence** | Explicit disagreements, directly beneath Today's Read ("None significant" when there are none) |
| 3 | **Rates & Yield Curve · Credit · Volatility** | The three vital signs in detail, one chart each |
| 4 | **Equity Confirmation** | Equity posture, index participation, breadth, sector rotation vs SPY |
| 5 | **Catalysts · Economic Releases** | One key takeaway, then the session's high-impact releases with forecast / previous (actual once printed) and the reading computed from them; second-tier and later releases as muted one-liners |

Every classification label can be hovered to show its evidence ("Why bear
steepening? 2Y +3 bp, 10Y +11 bp, 2s10s +8 bp…"), and every term of art has a
small **i** with a one-line definition. The page is meant to teach while it is
used.

**Colour follows interpretation, never sign.** Green = constructive/confirming,
red = deteriorating/stressed, amber = mixed/caution/background risk, gray =
neutral. Treasury yields are never coloured by direction. Event risk is never
green: LOW catalyst risk is not "good", it is just quiet.

---

## Architecture

```
DATA -> CALCULATIONS -> CLASSIFICATIONS -> CROSS-ASSET LOGIC -> TEXT EXPLANATION
```

The deterministic engine does everything up to the text. The language model
only explains the engine's output; it never sees raw numbers alone and never
decides a classification.

```
scripts/build-data.ts     The only code that calls providers. Writes public/data/*.json
services/
  blocks.ts               One cached adapter per raw block (10 blocks)
  dashboard.ts            Parallel fetch -> engine -> (optional) AI explanation
  providers/              Yahoo, Treasury, FRED, Cboe, TradingEconomics, Nasdaq, mock
lib/
  types.ts                Raw data contracts + engine output types
  engine/
    rates.ts              Curve shape, bull/bear steepening/flattening, 10Y driver, cycle backdrop
    credit.ts             HY/IG level band, direction, speed vs history, quality breadth, HYG/LQD
    volatility.ts         VIX regime, rate of change, term structure (futures or proxy)
    equities.ts           Breadth, participation, rotation vs SPY, equity posture
    synthesis.ts          Divergences, alignment, backdrop, tailwind/headwind, what changed, ES context
    narrative.ts          Rule-based Today's Read + the language rules every narrative must pass
    session.ts            NYSE holiday calendar, session phase, next/last session, quote labels
    catalysts.ts          Event risk and next major catalyst (kept separate from market posture)
    stats.ts              History ranking ("larger than 88% of 5-day moves")
  synthetic.ts            Seeded synthetic market data for tests and mock mode
  scenarios.ts            Named scenarios (reference, stress, credit-divergence, vol-shock)
  ai.ts                   Explanation only, validated, with rule-based fallback
config/
  thresholds.ts           Every threshold the engine uses — no magic numbers in logic
  glossary.ts             The definitions behind the "i" icons
  universe.ts             Breadth universe and sector ETF proxies
tests/                    Acceptance scenarios + engine and calendar tests (node:test)
```

---

## How each market is read

**Judged against its own history.** A move's "rank" is the share of that
series' own same-length moves (over the past year, or three years for credit)
that were smaller. Thresholds are ranks with fixed floors, so a very quiet
regime can't promote a 1 bp wiggle, plus fixed fallbacks when history is short.

### Rates & yield curve

- **Shape**: 2s10s upward-sloping / flat (±20 bp) / inverted.
- **Movement**: the 2s10s change must clear the noise gate, or the curve is
  **STABLE** — nothing is forced from noise.
- **Which leg moved**: the leading leg (larger absolute move) decides bull vs
  bear. Front end falling fastest = bull steepening; long end rising fastest =
  bear steepening; front end rising fastest = bear flattening; long end falling
  fastest = bull flattening. Both legs moving together = parallel shift.
- **Context**: a bull steepening reads as benign easing when credit and
  volatility are calm and as a growth scare when they are not.
- **10Y driver**: the 5-day nominal 10Y change is split into real yield (TIPS)
  and breakeven: REAL YIELDS / INFLATION EXPECTATIONS / MIXED. Omitted when
  real yields are unavailable.
- **Inversion is background only**: shown as cycle context, never as a signal.

The classification uses the official Treasury close-to-close curve (all tenors,
one source, one date). There is no reliable keyless live 2Y, so live Cboe ^TNX
is shown only as a labelled context line.

### Credit

HY OAS bands (<300 tight, 300–500 normal, 500–700 warning, 700–1000 stress,
1000+ crisis) are context. **Direction and speed carry the signal**: the 5-day
change is ranked against three years of 5-day changes → TIGHTENING / STABLE /
WIDENING / RAPIDLY WIDENING. HY and IG are read separately, so the page says
whether stress is confined to junk or broadening into investment grade.
HYG/LQD is a faster, price-based proxy and is never ranked above actual spreads.

### Volatility

VIX regime (very calm / normal / elevated / high fear / extreme) plus rate of
change (falling / stable / rising / spiking) plus **term structure**. Actual
VX futures (M2 vs M1) are used when available; otherwise VIX9D/VIX/VIX3M,
clearly labelled as a proxy. **Backwardation** outranks everything else. Low
VIX is never read as bullish: it means calm now.

### Equity confirmation

- **Breadth** (% above VWAP, A/D, RSP vs SPY) is judged against the index's own
  direction → BROAD / MIXED / NARROW / BROAD SELLING.
- **Index participation** (ES/NQ/RTY, RSP vs SPY) → BROAD CONFIRMATION,
  POSITIVE — LARGE-CAP LED, POSITIVE BUT NARROW, MIXED, BROAD WEAKNESS, …
- **Sector rotation** is measured **relative to SPY** across all eleven GICS
  sector ETFs plus semis: cyclical average (XLK, XLC, XLY, XLF, XLI, XLB) minus
  defensive average (XLV, XLP, XLU) → STRONG / MILD RISK-ON ROTATION, NEUTRAL,
  DEFENSIVE ROTATION. STRONG must be **broad** (most cyclicals beating SPY); a
  spread carried by one or two sectors is capped at MILD and called
  concentrated. Semis (inside XLK), energy (an inflation/geopolitical hedge)
  and real estate (hybrid, rate-driven) are shown but kept out of the spread.
  The XLY/XLP and XLF/XLU paired opposites appear in the evidence.
- **Equity posture**: AGGRESSIVE RISK-ON / CONSTRUCTIVE / MIXED /
  TRANSITIONING / DEFENSIVE ROTATION / RISK-OFF.

Rotation is confirmation only. The equity lean handed to the cross-asset layer
follows the ES tape first; rotation only decides it on a flat day.

### Cross-asset logic

Detected divergences: equity/credit, volatility/credit, volatility-only fear,
rotation/credit, index participation, unconfirmed selloff, equity/volatility.

The backdrop leads with the equity tape, then qualifies it by confirmation:
BROADLY CONFIRMED RISK-ON, RISK-ON — CREDIT / VOLATILITY NOT CONFIRMING,
RISK-ON — RATES HEADWIND, RISK-ON — UNEVEN PARTICIPATION, RISK-OFF — NOT
BROADLY CONFIRMED, BROADLY CONFIRMED RISK-OFF / STRESS, MIXED / DIVERGENT, …

Signal alignment is STRONG / MODERATE / MIXED — a statement about agreement,
never a percentage.

---

## Data sources

| Block | Source | Notes |
|---|---|---|
| ES / NQ / RTY | Yahoo (`ES=F`, `NQ=F`, `RTY=F`) | 1-day and 5-day changes |
| Breadth | Yahoo 5-min bars for all ~503 S&P 500 members | Refuses to report below 90% coverage |
| Sectors | Yahoo sector ETFs + SPY, 3 months daily | Relative performance and noise ranking |
| Treasury curve | home.treasury.gov nominal + real par curves | 3M/2Y/5Y/10Y/30Y + 10Y TIPS, ~1 year |
| Live 10Y | Cboe ^TNX via Yahoo | Context line only |
| HY / IG OAS | FRED `BAMLH0A0HYM2`, `BAMLC0A0CM` | Daily, one-day lag, ~3 years |
| HYG / LQD | Yahoo, 3 months daily | Faster proxy |
| VIX, VIX9D, VIX3M | Cboe via Yahoo, 1 year daily | |
| VX futures | cboe.com delayed futures quotes | Monthly contracts only |
| Economic calendar | tradingeconomics.com, US, 2-star+ | Two weeks ahead |
| Earnings | api.nasdaq.com ∩ S&P 500 membership | ≥ $200B market cap only |

Only FRED needs a (free) key. Every source is labelled with what its numbers
represent: "Live", "Fri close", or "As of Sep 10" for daily series.

### Economic releases

Every scheduled release is interpreted through the release library in
[`config/releases.ts`](config/releases.ts): one of five primary categories
(INFLATION, LABOR, GROWTH, FED, SENTIMENT) plus an optional secondary
("Consumer Prices", "Wages", "Housing"…) and what a higher or lower reading
means economically. Interest rates are the transmission from data to markets,
never a category, and no meaning ever names an equity direction. Rows of one
release are grouped (CPI's MoM, YoY and core rows become one CPI release).

The meanings are applied automatically. Before the print a release shows
**Forecast | Previous** and what the market expects to change ("Exp. vs prior:
▲ stronger consumer demand"); after it, **Actual | Forecast | Previous** with
the surprise ("▲ Above forecast → stronger inflation pressure"), judged against
a per-release tolerance so rounding noise is not called a surprise. Forecast is
the market consensus; TradingEconomics' own estimate is used only when no
consensus exists, and is labelled.

The section opens with a single computed **key takeaway**: a high-impact
release that printed away from forecast, else the session's next high-impact
release, else the next major catalyst. High-impact releases are bold rows;
second-tier and later releases are muted one-liners, with categories and
secondary figures on hover.

**Current Macro Focus** is inferred from what rates and credit are repricing
(a big front-end move → Fed easing expectations; credit widening → recession
risk; …) and marks the releases that matter most that day. If nothing is being
repriced it says so and names the next key scheduled test. **Scheduled event
risk** is catalyst risk only, never a measure of market stress.

**Sessions** come from a computed NYSE calendar (all holidays and observed
dates, early closes). "Next session" is the next exchange trading day, never
"the next day that has an economic release"; the next major catalyst is shown
separately.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000, data refreshed every 2 minutes
npm test             # engine, acceptance scenarios, calendar
npm run typecheck
```

| Script | What it does |
|---|---|
| `npm run dev` | Local dashboard, data refreshed every 2 minutes |
| `npm run data` | Fetch every source once and write `public/data/*.json` |
| `npm run build` | Static export to `out/` |
| `npm run preview` | Serve `out/` locally |
| `npm test` | Run the test suite |

`DATA_MODE=mock` serves synthetic data; `MOCK_SCENARIO` picks the story
(`reference`, `stress`, `credit-divergence`, `vol-shock`). Any section serving
mock data is named in the header.

### Tests

`tests/acceptance.test.ts` encodes the eight acceptance scenarios from the
specification (bull/bear steepening, volatility-only fear, credit widening
under calm volatility, broadly confirmed stress, narrow large-cap strength,
rotation/credit divergence, and Saturday → Monday session with a Tuesday
catalyst). They run the full engine on synthetic data with a year of realistic
noise, so the history-ranked thresholds are exercised as they are live.

---

## AI usage

Optional. With `ANTHROPIC_API_KEY` set, the model writes the Today's Read
paragraph from the engine's computed facts. The output must pass the same
rules as the rule-based writer — at most four sentences, no trade-direction
language — or the rule-based text is used. A narrative is only displayed for
the snapshot it was written about, and it is reused while every
classification is unchanged, so a 5-minute refresh is not a 5-minute model
call. Without a key, the deterministic writer runs and no request is made.

---

## Hosting: GitHub Pages, free with no metering

The site is a static export. A scheduled GitHub Action runs the tests, fetches
every source once, writes `public/data/*.json`, builds the site and publishes
it to Pages. Visitors download static files and never trigger a fetch.

| | |
|---|---|
| Refresh cadence | Every 5 min on weekdays; every 30 min on weekends |
| Cost | Free: Actions minutes are free for public repos, and Pages is free static hosting |
| Page load | Served from GitHub's CDN, with the latest snapshot embedded in the HTML |
| Polling | The page checks for a newer snapshot every 60s (static file, no cost) |

Resilience:

- **Last known good.** A provider that fails is carried forward from the
  published snapshot, marked STALE with its original timestamp — but only from
  a snapshot with the same schema version.
- **Never publishes an empty page.** If every provider fails, the job fails and
  the live site is left untouched.
- **Client-side ageing.** Freshness, session state and the next-catalyst
  countdown are recomputed against the viewer's clock.
- **Keepalive.** A weekly check commits a heartbeat if the repo has been quiet
  for 45 days, so GitHub doesn't disable the schedule.

One-time setup: push as a public repo; **Settings → Pages → Source: GitHub
Actions**; add `FRED_API_KEY` (and optionally `ANTHROPIC_API_KEY`) under
**Settings → Secrets and variables → Actions**.

### Caveats

- Yahoo is unofficial and unlicensed, and CME quotes are typically 10–30
  minutes delayed. Fine for context; not something to trade size against.
- TradingEconomics is scraped. If its markup changes the calendar shows
  UNAVAILABLE rather than an empty list.
- Treasury and FRED series are end-of-day. During the session the curve and
  spreads describe the prior close, and are labelled with their date.

---

## Deliberately not included

Support/resistance and overnight levels (handled on the charts), additional
breadth variants, VVIX/skew, full sector tables, the complete economic and
earnings calendars, and any composite score. The dashboard answers the seven
questions above and nothing else.
