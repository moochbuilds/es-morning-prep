/**
 * One- or two-sentence definitions behind the small "i" icons. The dashboard
 * should teach the vocabulary while it is being used.
 */
export const GLOSSARY = {
  bullSteepening:
    "The curve steepens because short-dated yields fall faster than long-dated ones — usually the market pricing easier Fed policy. Whether that is benign or a growth scare depends on credit and volatility.",
  bearSteepening:
    "The curve steepens because long-dated yields rise faster than short-dated ones — term premium, inflation or supply concerns are lifting the long end.",
  bullFlattening:
    "The curve flattens because long-dated yields fall faster than short-dated ones — long-run growth or inflation expectations are softening relative to policy.",
  bearFlattening:
    "The curve flattens because short-dated yields rise faster than long-dated ones — the market is pricing tighter policy.",
  parallelShift:
    "Short and long yields move together by a similar amount, so the slope is unchanged but the level of rates moved.",
  curveStable:
    "Curve changes are within this series' normal day-to-day noise, so no slope classification is forced.",
  twosTens:
    "10Y yield minus 2Y yield. Positive means an upward-sloping curve; negative means inverted.",
  threeMonthTens:
    "10Y yield minus 3-month bill yield — the spread the Fed's own research leans on as a longer-cycle recession indicator.",
  inversion:
    "Short rates above long rates. Historically a background recession warning with a 6–24 month lag — not an intraday timing signal.",
  realYield:
    "The 10Y TIPS yield: the inflation-adjusted return on a 10-year Treasury. Rising real yields raise the discount rate on future earnings.",
  breakeven:
    "Nominal 10Y minus real 10Y — the inflation rate the bond market is pricing over ten years.",
  tenYearDriver:
    "Splits the 10Y move into its real-yield part and its inflation-expectation part. A 10Y rising on real yields is a tighter-conditions story; rising on breakevens is an inflation story.",
  oas:
    "Option-adjusted spread: the extra yield corporate bonds pay over Treasuries for default and liquidity risk. Published daily with a one-day lag.",
  creditWidening:
    "Spreads rising: investors demand more compensation to hold corporate risk. Direction and speed matter more than the absolute level.",
  creditQuality:
    "High yield is the sensitive, fast gauge. When investment-grade spreads widen too, stress is spreading to higher-quality borrowers — a more serious escalation.",
  hygLqd:
    "High-yield bond ETF vs investment-grade bond ETF. A faster, price-based read on whether lower-quality credit is keeping up. It includes distribution drag, so it is a proxy, not a spread.",
  vix:
    "30-day implied volatility of S&P 500 options — what traders pay for near-term protection. It measures the size of expected moves, not their direction.",
  contango:
    "Longer-dated volatility priced above near-term volatility. The normal state: uncertainty grows with time.",
  backwardation:
    "Near-term volatility priced above longer-dated volatility. Acute, immediate stress — protection is needed now.",
  termProxy:
    "Built from the VIX9D, VIX and VIX3M indices rather than VIX futures. It shows the same shape but is a proxy, not futures contango.",
  breadth:
    "How many stocks participate in the index move. Checked against the index's own direction: a rally with most stocks below VWAP is narrow.",
  vwap:
    "Volume-weighted average price for the session. A stock above its VWAP has buyers in control of the day so far.",
  equalWeight:
    "RSP holds every S&P 500 stock at the same weight. RSP trailing SPY means the largest names are doing the lifting.",
  cyclicalRotation:
    "Average of cyclical sectors (tech, communication services, discretionary, financials, industrials, materials) minus defensives (utilities, staples, healthcare), each measured against SPY. Strong rotation must be broad, not carried by one or two sectors.",
  relativeToSpy:
    "Sector move minus SPY's move. On a strong day every sector can be green; relative performance shows where money is actually rotating.",
  posture:
    "Categorical read of equity internals from rotation, participation and breadth. It is equity confirmation, never a signal on its own, and never overrides credit, rates, volatility or ES price action.",
  alignment:
    "Whether rates, credit, volatility and equities agree. Disagreement is reported as information, not averaged away.",
  eventRisk:
    "Scheduled event risk only: how much the session's scheduled releases could move ES, from their importance and clustering. It is not a measure of current market stress.",
  macroFocus:
    "What the market currently appears most sensitive to, inferred from what rates and credit are repricing. Releases in those categories tend to matter more than usual.",
  surprise:
    "How a release reaches ES: data → inflation / labor / growth read → Fed expectations → rate expectations → market reaction. The market reacts to actual vs forecast, not to whether a number is objectively high or low.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
