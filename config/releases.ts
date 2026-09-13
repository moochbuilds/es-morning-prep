/**
 * The economic-release library: what each scheduled U.S. release measures and
 * what a higher or lower reading means economically.
 *
 * The meanings are applied automatically to the data — actual vs forecast
 * once a release prints, forecast vs previous before it — so the page shows a
 * computed reading, never a generic rule. Everything here is ECONOMIC
 * interpretation, never an equity call. The chain the dashboard teaches is:
 *
 *   release -> inflation / labor / growth read -> Fed expectations
 *           -> interest-rate expectations -> market reaction
 *
 * Interest rates are the transmission mechanism, not a data category, so no
 * release is classified under them.
 *
 * Matching is against the calendar provider's event key (TradingEconomics
 * slug, lower case). Rows of the same release at the same time are grouped:
 * CPI arrives as MoM, YoY, core and index rows, and is shown as one release.
 */

import type { Importance, ReleaseCategory } from "@/lib/types";

export interface ReleaseSeries {
  match: RegExp;
  /** Short figure label, e.g. "Core MoM". */
  label: string;
}

export interface ReleaseDef {
  id: string;
  /** Display name; null uses the provider's own title (generic families). */
  name: string | null;
  /** Null for scheduled events that are not economic data (Treasury auctions). */
  category: ReleaseCategory | null;
  secondary: string | null;
  /** Overrides the provider's importance; omit to keep it. */
  importance?: Importance;
  /** Economic meaning of a higher / lower reading. Omit for communication events. */
  higher?: string;
  lower?: string;
  /**
   * A difference at or below this, in the series' own units, reads IN LINE /
   * UNCHANGED. Keeps rounding noise from being called a surprise.
   */
  tolerance?: number;
  /** Figures shown, headline first (readings are judged on the headline). Max two. */
  series: ReleaseSeries[];
  /** Other rows that belong to this release and are grouped into it, not shown. */
  also?: RegExp;
}

/**
 * Most specific first: the first definition whose series or `also` pattern
 * matches a row wins.
 */
export const RELEASES: ReleaseDef[] = [
  // ------------------------------------------------------------------ FED
  {
    id: "fomc-decision",
    name: "FOMC Rate Decision",
    category: "FED",
    secondary: "Monetary Policy",
    importance: "HIGH",
    higher: "more restrictive policy",
    lower: "more accommodative policy",
    tolerance: 0.01,
    series: [{ match: /^fed interest rate decision/, label: "Fed funds (upper)" }],
    also: /^(fomc economic projections|interest rate projection)/,
  },
  {
    id: "fed-presser",
    name: "Fed Press Conference",
    category: "FED",
    secondary: "Monetary Policy",
    importance: "HIGH",
    series: [],
    also: /^fed (press conference|chair .*press)/,
  },
  {
    id: "fomc-minutes",
    name: "FOMC Minutes",
    category: "FED",
    secondary: "Monetary Policy",
    importance: "HIGH",
    series: [],
    also: /^fomc minutes/,
  },
  {
    id: "powell",
    name: null,
    category: "FED",
    secondary: "Monetary Policy",
    importance: "HIGH",
    series: [],
    also: /(powell|fed chair)/,
  },
  {
    id: "beige-book",
    name: "Fed Beige Book",
    category: "FED",
    secondary: "Economic Conditions",
    importance: "HIGH",
    series: [],
    also: /^(fed )?beige book/,
  },
  {
    id: "fed-speaker",
    name: null,
    category: "FED",
    secondary: "Monetary Policy",
    series: [],
    also: /^fed .*(speech|testimony|remarks)/,
  },

  // ------------------------------------------------------------ INFLATION
  {
    id: "cpi",
    name: "CPI",
    category: "INFLATION",
    secondary: "Consumer Prices",
    importance: "HIGH",
    higher: "stronger inflation pressure",
    lower: "softer inflation pressure",
    tolerance: 0.05,
    series: [
      { match: /^core inflation rate mom/, label: "Core MoM" },
      { match: /^inflation rate yoy/, label: "Headline YoY" },
    ],
    also: /^(core inflation rate|inflation rate|cpi\b|core cpi)/,
  },
  {
    id: "ppi",
    name: "PPI",
    category: "INFLATION",
    secondary: "Producer Prices",
    importance: "HIGH",
    higher: "more upstream cost pressure",
    lower: "easing upstream cost pressure",
    tolerance: 0.05,
    series: [
      { match: /^core ppi mom/, label: "Core MoM" },
      { match: /^ppi mom/, label: "Headline MoM" },
    ],
    also: /^(core ppi|ppi\b|producer price)/,
  },
  {
    id: "pce",
    name: "Core PCE",
    category: "INFLATION",
    secondary: "Consumer Prices",
    importance: "HIGH",
    higher: "firmer underlying inflation",
    lower: "softer underlying inflation",
    tolerance: 0.05,
    series: [
      { match: /^core pce price index mom/, label: "Core MoM" },
      { match: /^pce price index yoy/, label: "Headline YoY" },
    ],
    also: /^(core pce price index|pce price index)/,
  },
  {
    id: "michigan-inflation",
    name: "Michigan Inflation Expectations",
    category: "INFLATION",
    secondary: "Inflation Expectations",
    higher: "inflation expectations drifting up",
    lower: "inflation expectations easing",
    tolerance: 0.05,
    series: [
      { match: /^michigan inflation expectations/, label: "1-year" },
      { match: /^michigan 5 year inflation expectations/, label: "5-year" },
    ],
  },
  {
    id: "ny-fed-inflation",
    name: "NY Fed Inflation Expectations",
    category: "INFLATION",
    secondary: "Inflation Expectations",
    higher: "inflation expectations drifting up",
    lower: "inflation expectations easing",
    tolerance: 0.05,
    series: [{ match: /^consumer inflation expectations/, label: "1-year" }],
  },
  {
    id: "import-prices",
    name: "Import & Export Prices",
    category: "INFLATION",
    secondary: "Import Prices",
    higher: "more imported price pressure",
    lower: "less imported price pressure",
    tolerance: 0.05,
    series: [{ match: /^import prices mom/, label: "Import MoM" }],
    also: /^(import|export) prices/,
  },
  {
    id: "used-cars",
    name: "Used Car Prices",
    category: "INFLATION",
    secondary: "Consumer Prices",
    higher: "more goods-price pressure",
    lower: "less goods-price pressure",
    tolerance: 0.1,
    series: [{ match: /^used car prices mom/, label: "MoM" }],
    also: /^used car prices/,
  },

  // ---------------------------------------------------------------- LABOR
  {
    id: "nfp",
    name: "Nonfarm Payrolls",
    category: "LABOR",
    secondary: "Employment",
    importance: "HIGH",
    higher: "stronger labor demand",
    lower: "softer labor demand",
    tolerance: 25_000,
    series: [{ match: /^non ?farm payrolls$/, label: "Payrolls" }],
    also: /^(non ?farm payrolls|government payrolls|manufacturing payrolls)/,
  },
  {
    id: "unemployment",
    name: "Unemployment Rate",
    category: "LABOR",
    secondary: "Employment",
    importance: "HIGH",
    higher: "labor market weakening",
    lower: "labor market tightening",
    tolerance: 0.05,
    series: [{ match: /^unemployment rate/, label: "Rate" }],
    also: /^(u-6 unemployment rate|participation rate)/,
  },
  {
    id: "ahe",
    name: "Average Hourly Earnings",
    category: "LABOR",
    secondary: "Wages",
    importance: "HIGH",
    higher: "stronger wage pressure",
    lower: "softer wage pressure",
    tolerance: 0.05,
    series: [
      { match: /^average hourly earnings mom/, label: "MoM" },
      { match: /^average hourly earnings yoy/, label: "YoY" },
    ],
    also: /^average weekly hours/,
  },
  {
    id: "claims",
    name: "Initial Jobless Claims",
    category: "LABOR",
    secondary: "Employment",
    importance: "HIGH",
    higher: "more layoffs — softer labor market",
    lower: "fewer layoffs — firmer labor market",
    tolerance: 5_000,
    series: [
      { match: /^initial jobless claims/, label: "Initial" },
      { match: /^continuing jobless claims/, label: "Continuing" },
    ],
    also: /jobless claims/,
  },
  {
    id: "jolts",
    name: "JOLTS Job Openings",
    category: "LABOR",
    secondary: "Employment",
    importance: "HIGH",
    higher: "stronger labor demand",
    lower: "cooling labor demand",
    tolerance: 100_000,
    series: [
      { match: /^jolts job openings/, label: "Openings" },
      { match: /^jolts job quits/, label: "Quits" },
    ],
  },
  {
    id: "adp-weekly",
    name: "ADP Weekly Employment",
    category: "LABOR",
    secondary: "Employment",
    importance: "MED",
    higher: "stronger hiring",
    lower: "softer hiring",
    tolerance: 5_000,
    series: [{ match: /^adp employment change weekly/, label: "Weekly" }],
  },
  {
    id: "adp",
    name: "ADP Employment",
    category: "LABOR",
    secondary: "Employment",
    importance: "HIGH",
    higher: "stronger hiring",
    lower: "softer hiring",
    tolerance: 20_000,
    series: [{ match: /^adp employment change$/, label: "Private jobs" }],
  },
  {
    id: "challenger",
    name: "Challenger Job Cuts",
    category: "LABOR",
    secondary: "Employment",
    higher: "more announced layoffs",
    lower: "fewer announced layoffs",
    series: [{ match: /^challenger job cuts/, label: "Announced cuts" }],
  },
  {
    id: "labor-costs",
    name: "Productivity & Unit Labor Costs",
    category: "LABOR",
    secondary: "Wages",
    higher: "more wage-driven cost pressure",
    lower: "less wage-driven cost pressure",
    tolerance: 0.2,
    series: [
      { match: /^unit labou?r costs/, label: "Unit labor costs" },
      { match: /^nonfarm productivity/, label: "Productivity" },
    ],
    also: /^employment cost index/,
  },

  // --------------------------------------------------------------- GROWTH
  {
    id: "gdp",
    name: "GDP",
    category: "GROWTH",
    secondary: null,
    importance: "HIGH",
    higher: "stronger growth",
    lower: "weaker growth",
    tolerance: 0.2,
    series: [{ match: /^gdp growth rate/, label: "QoQ annualized" }],
    also: /^(gdp|(core )?pce prices qoq|real consumer spending|corporate profits)/,
  },
  {
    id: "retail-sales",
    name: "Retail Sales",
    category: "GROWTH",
    secondary: "Consumer Spending",
    importance: "HIGH",
    higher: "stronger consumer demand",
    lower: "weaker consumer demand",
    tolerance: 0.1,
    series: [
      { match: /^retail sales mom/, label: "MoM" },
      { match: /^retail sales control group/, label: "Control group" },
    ],
    also: /^retail sales/,
  },
  {
    id: "personal-spending",
    name: "Personal Income & Spending",
    category: "GROWTH",
    secondary: "Consumer Spending",
    higher: "stronger consumer demand",
    lower: "weaker consumer demand",
    tolerance: 0.1,
    series: [
      { match: /^personal spending mom/, label: "Spending" },
      { match: /^personal income mom/, label: "Income" },
    ],
    also: /^real personal spending/,
  },
  {
    id: "ism-manufacturing",
    name: "ISM Manufacturing",
    category: "GROWTH",
    secondary: "Manufacturing",
    importance: "HIGH",
    higher: "improving manufacturing activity",
    lower: "weakening manufacturing activity",
    tolerance: 0.5,
    series: [
      { match: /^ism manufacturing pmi/, label: "PMI" },
      { match: /^ism manufacturing prices/, label: "Prices paid" },
    ],
    also: /^ism manufacturing/,
  },
  {
    id: "ism-services",
    name: "ISM Services",
    category: "GROWTH",
    secondary: "Services",
    importance: "HIGH",
    higher: "improving services activity",
    lower: "weakening services activity",
    tolerance: 0.5,
    series: [
      { match: /^ism services pmi/, label: "PMI" },
      { match: /^ism services prices/, label: "Prices paid" },
    ],
    also: /^ism services/,
  },
  {
    id: "sp-pmi",
    name: "S&P Global PMI",
    category: "GROWTH",
    secondary: "Business Activity",
    importance: "HIGH",
    higher: "improving business activity",
    lower: "weakening business activity",
    tolerance: 0.5,
    series: [
      { match: /^s&p global composite pmi/, label: "Composite" },
      { match: /^s&p global manufacturing pmi/, label: "Manufacturing" },
    ],
    also: /^s&p global/,
  },
  {
    id: "empire",
    name: "Empire State Manufacturing",
    category: "GROWTH",
    secondary: "Manufacturing",
    importance: "HIGH",
    higher: "improving manufacturing activity",
    lower: "weakening manufacturing activity",
    tolerance: 2,
    series: [{ match: /^ny empire state manufacturing/, label: "General index" }],
  },
  {
    id: "philly",
    name: "Philadelphia Fed Manufacturing",
    category: "GROWTH",
    secondary: "Manufacturing",
    importance: "HIGH",
    higher: "improving manufacturing activity",
    lower: "weakening manufacturing activity",
    tolerance: 2,
    series: [
      { match: /^philadelphia fed manufacturing/, label: "General index" },
      { match: /^philly fed prices paid/, label: "Prices paid" },
    ],
    also: /^philly fed/,
  },
  {
    id: "chicago-pmi",
    name: "Chicago PMI",
    category: "GROWTH",
    secondary: "Manufacturing",
    importance: "HIGH",
    higher: "improving business activity",
    lower: "weakening business activity",
    tolerance: 1,
    series: [{ match: /^chicago pmi/, label: "PMI" }],
  },
  {
    id: "durable-goods",
    name: "Durable Goods Orders",
    category: "GROWTH",
    secondary: "Business Investment",
    importance: "HIGH",
    higher: "stronger investment demand",
    lower: "weaker investment demand",
    tolerance: 0.5,
    series: [
      { match: /^durable goods orders mom/, label: "Headline" },
      { match: /^non defense goods orders ex air/, label: "Core capex" },
    ],
    also: /^durable goods/,
  },
  {
    id: "housing-starts",
    name: "Housing Starts & Permits",
    category: "GROWTH",
    secondary: "Housing",
    higher: "more housing activity",
    lower: "less housing activity",
    tolerance: 30_000,
    series: [
      { match: /^housing starts$/, label: "Starts" },
      { match: /^building permits( prel)?$/, label: "Permits" },
    ],
    also: /^(housing starts|building permits)/,
  },
  {
    id: "nahb",
    name: "NAHB Housing Market Index",
    category: "GROWTH",
    secondary: "Housing",
    higher: "better builder conditions",
    lower: "worse builder conditions",
    tolerance: 1,
    series: [{ match: /^nahb housing market index/, label: "Index" }],
  },
  {
    id: "industrial-production",
    name: "Industrial Production",
    category: "GROWTH",
    secondary: "Manufacturing",
    higher: "stronger output",
    lower: "weaker output",
    tolerance: 0.1,
    series: [
      { match: /^industrial production mom/, label: "MoM" },
      { match: /^capacity utilization/, label: "Capacity use" },
    ],
    also: /^(industrial production|manufacturing production)/,
  },

  // ------------------------------------------------------------ SENTIMENT
  {
    id: "consumer-confidence",
    name: "CB Consumer Confidence",
    category: "SENTIMENT",
    secondary: "Consumer",
    importance: "HIGH",
    higher: "more confident consumers",
    lower: "less confident consumers",
    tolerance: 2,
    series: [{ match: /^cb consumer confidence/, label: "Index" }],
  },
  {
    id: "michigan-sentiment",
    name: "Michigan Consumer Sentiment",
    category: "SENTIMENT",
    secondary: "Consumer",
    importance: "HIGH",
    higher: "more confident consumers",
    lower: "more pessimistic consumers",
    tolerance: 1,
    series: [{ match: /^michigan consumer sentiment/, label: "Sentiment" }],
    also: /^michigan (consumer expectations|current conditions)/,
  },
  {
    id: "small-business",
    name: "NFIB Small Business Optimism",
    category: "SENTIMENT",
    secondary: "Business",
    higher: "more optimistic businesses",
    lower: "less optimistic businesses",
    tolerance: 1,
    series: [{ match: /^nfib business optimism/, label: "Index" }],
  },
  {
    id: "optimism",
    name: null,
    category: "SENTIMENT",
    secondary: "Consumer",
    higher: "more optimism",
    lower: "less optimism",
    series: [],
    also: /(optimism|sentiment|confidence)/,
  },

  // ---------------------------------------- Scheduled, but not economic data
  {
    id: "auction-long",
    name: null,
    category: null,
    secondary: "Treasury supply",
    importance: "HIGH",
    series: [],
    also: /^(10-year note|20-year bond|30-year bond) auction/,
  },
  {
    id: "auction",
    name: null,
    category: null,
    secondary: "Treasury supply",
    importance: "MED",
    series: [],
    also: /^(2|3|5|7)-year note auction|^10-year tips auction/,
  },
  {
    id: "not-index-relevant",
    name: null,
    category: null,
    secondary: null,
    importance: "LOW",
    series: [],
    also: /(bill auction|frn auction|crude|eia |api |oil rig|rigs count|mortgage|mba |fed balance sheet|money supply|tic flows|capital flows|foreign bond|nopa|grain stocks|redbook|logistics managers)/,
  },
];

/**
 * Fallback families for the long tail, matched by keyword, so every remaining
 * release still gets a category and a computed reading.
 */
export const RELEASE_FAMILIES: ReleaseDef[] = [
  {
    id: "family-housing",
    name: null,
    category: "GROWTH",
    secondary: "Housing",
    higher: "stronger housing activity",
    lower: "weaker housing activity",
    series: [],
    also: /(home sales|house price|case-shiller|construction spending|housing)/,
  },
  {
    id: "family-regional",
    name: null,
    category: "GROWTH",
    secondary: "Regional Survey",
    higher: "improving activity",
    lower: "weakening activity",
    series: [],
    also: /(fed .*(manufacturing|composite|services)|ny fed services|factory orders)/,
  },
  {
    id: "family-trade",
    name: null,
    category: "GROWTH",
    secondary: "Trade",
    higher: "narrower deficit — adds to growth",
    lower: "wider deficit — subtracts from growth",
    series: [],
    also: /(trade balance|balance of trade|current account|^exports|^imports)/,
  },
  {
    id: "family-inventories",
    name: null,
    category: "GROWTH",
    secondary: "Inventories",
    higher: "more inventory building",
    lower: "inventory drawdown",
    series: [],
    also: /inventories/,
  },
  {
    id: "family-consumer",
    name: null,
    category: "GROWTH",
    secondary: "Consumer Spending",
    higher: "stronger consumer demand",
    lower: "weaker consumer demand",
    series: [],
    also: /(consumer credit|vehicle sales|spending)/,
  },
  {
    id: "family-labor",
    name: null,
    category: "LABOR",
    secondary: "Employment",
    series: [],
    also: /(payroll|employment|jobs|job )/,
  },
  {
    id: "family-growth",
    name: null,
    category: "GROWTH",
    secondary: null,
    higher: "stronger activity",
    lower: "weaker activity",
    series: [],
    also: /./,
  },
];

/**
 * Why each category matters — the transmission step between the data and the
 * market. Shown on hover.
 */
export const CATEGORY_WHY: Record<ReleaseCategory, string> = {
  INFLATION:
    "Inflation data shape how restrictive the Fed must stay, which moves front-end yields and then valuations.",
  LABOR:
    "Jobs and wages drive both growth and the Fed's reaction: a tight labor market can keep inflation and rates higher.",
  GROWTH:
    "Growth data say whether demand and earnings are holding up; strong growth can also keep rates higher for longer.",
  FED: "Fed communication directly resets the expected policy path, and with it interest-rate expectations.",
  SENTIMENT:
    "Soft survey data: an early read on spending and inflation expectations, usually lower impact than hard data.",
};
