import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isEarlyClose,
  isTradingDay,
  nextTradingDay,
  nyseHolidays,
  quoteLabel,
  sessionInfo,
} from "@/lib/engine/session";

import { SATURDAY, et } from "./helpers";

describe("NYSE holidays", () => {
  const h2026 = nyseHolidays(2026);

  it("computes 2026 holidays, including observed dates", () => {
    assert.equal(h2026.get("2026-04-03"), "Good Friday");
    assert.equal(h2026.get("2026-07-03"), "Independence Day"); // July 4 is a Saturday
    assert.equal(h2026.get("2026-09-07"), "Labor Day");
    assert.equal(h2026.get("2026-11-26"), "Thanksgiving Day");
    assert.equal(h2026.get("2026-12-25"), "Christmas Day");
  });

  it("does not close for a Saturday New Year's Day", () => {
    assert.equal(isTradingDay("2021-12-31"), true);
  });

  it("observes a Saturday Juneteenth on Friday", () => {
    assert.equal(isTradingDay("2027-06-18"), false);
  });

  it("skips a Monday holiday when finding the next session", () => {
    assert.equal(nextTradingDay("2027-01-16"), "2027-01-19"); // MLK Day 2027-01-18
  });

  it("knows the early closes", () => {
    assert.equal(isEarlyClose("2026-11-27"), true);
    assert.equal(isEarlyClose("2026-12-24"), true);
    assert.equal(isEarlyClose("2026-09-10"), false);
  });
});

describe("session phases", () => {
  it("Saturday is the weekend with Monday next", () => {
    const s = sessionInfo(SATURDAY);
    assert.equal(s.phase, "WEEKEND");
    assert.equal(s.futuresOpen, false);
    assert.equal(s.lastSession, "2026-09-11");
    assert.equal(s.nextSession, "2026-09-14");
  });

  it("Friday after 5 pm is already the weekend", () => {
    assert.equal(sessionInfo(et("2026-09-11", 18 * 60)).phase, "WEEKEND");
  });

  it("Sunday evening is pre-market with Globex open", () => {
    const s = sessionInfo(et("2026-09-13", 19 * 60));
    assert.equal(s.phase, "PRE-MARKET");
    assert.equal(s.futuresOpen, true);
    assert.equal(s.nextSession, "2026-09-14");
  });

  it("Monday morning before the open is pre-market for today", () => {
    const s = sessionInfo(et("2026-09-14", 8 * 60));
    assert.equal(s.phase, "PRE-MARKET");
    assert.equal(s.nextSession, "2026-09-14");
    assert.equal(s.lastSession, "2026-09-11");
  });

  it("regular hours are RTH, and the daily halt is recognised", () => {
    assert.equal(sessionInfo(et("2026-09-14", 11 * 60)).phase, "RTH");
    assert.equal(sessionInfo(et("2026-09-16", 17 * 60 + 30)).phase, "DAILY HALT");
  });

  it("a weekday holiday is closed, with the next session after it", () => {
    const s = sessionInfo(et("2026-09-07", 11 * 60));
    assert.equal(s.phase, "HOLIDAY");
    assert.equal(s.nextSession, "2026-09-08");
  });
});

describe("quote labels never pass weekend data off as live", () => {
  const s = sessionInfo(SATURDAY);
  const fridayClose = new Date(et("2026-09-11", 16 * 60)).toISOString();

  it("labels Friday's futures close on a Saturday", () => {
    assert.deepEqual(quoteLabel(fridayClose, s, "futures"), { label: "Fri close", live: false });
  });

  it("labels Friday's cash close on a Saturday", () => {
    assert.deepEqual(quoteLabel(fridayClose, s, "cash"), { label: "Fri close", live: false });
  });

  it("labels an intraday quote during RTH as live", () => {
    const rth = sessionInfo(et("2026-09-14", 11 * 60));
    const q = new Date(et("2026-09-14", 10 * 60 + 55)).toISOString();
    assert.equal(quoteLabel(q, rth, "cash").live, true);
  });
});
