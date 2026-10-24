import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { RULE_FIELDS, diffSettings, parseRuleForm, toDisplay } from "@/lib/rules/fields";
import { assess } from "@/lib/rules/engine";
import { getCurrentRules, listVersions, saveNewVersion, RulesError } from "@/lib/services/rules";
import { listLosses, saveLoss, ResultsError } from "@/lib/services/results";
import { ensureUsers } from "@/lib/services/users";
import { fullQuarterLabels, reductionVsBaseline, roleOf, verdict, BASELINE_MID, LAKH } from "@/lib/results";

const asForm = (over: Record<string, string> = {}) => ({
  ...Object.fromEntries(RULE_FIELDS.map((f) => [f.key, String(toDisplay(f, DEFAULT_RULES[f.key]))])),
  ...over,
});

describe("rules form", () => {
  it("round-trips the defaults exactly (percentages shown as percent)", () => {
    expect(asForm().swingPct).toBe("40");
    const r = parseRuleForm(asForm());
    expect(r.ok && r.settings).toEqual(DEFAULT_RULES);
  });
  it("rejects nonsense in plain English", () => {
    const r = parseRuleForm(asForm({ maxCoverWeeks: "5", minCoverWeeks: "6", avgWindowWeeks: "20" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(" ")).toMatch(/pause level must be higher/);
      expect(r.errors.join(" ")).toMatch(/Weeks in the average must be a whole number from 1 to 16/);
    }
  });
  it("lists exactly what changed", () => {
    const next = { ...DEFAULT_RULES, minCoverWeeks: 5, swingPct: 0.5 };
    expect(diffSettings(DEFAULT_RULES, next).map((c) => `${c.label}: ${c.from} -> ${c.to}`)).toEqual([
      "Weekly sales swing: 40% -> 50%",
      "Normal SKU: reorder below: 6 weeks -> 5 weeks",
    ]);
  });
});

describe("rule versions (in-memory Postgres)", () => {
  let db: Db;
  let admin: { id: string; role: string };
  let planner: { id: string; role: string };
  beforeAll(async () => {
    db = await createDb({ memory: true });
    const us = await ensureUsers(db);
    admin = us.find((u) => u.role === "admin")!;
    planner = us.find((u) => u.role === "planner")!;
  }, 60_000);

  it("only an Admin can change rules, and a reason is required", async () => {
    await expect(saveNewVersion(db, { ...DEFAULT_RULES, minCoverWeeks: 5 }, "x", planner)).rejects.toBeInstanceOf(RulesError);
    await expect(saveNewVersion(db, { ...DEFAULT_RULES, minCoverWeeks: 5 }, "  ", admin)).rejects.toBeInstanceOf(RulesError);
    await expect(saveNewVersion(db, DEFAULT_RULES, "no change", admin)).rejects.toThrow(/Nothing was changed/);
  });
  it("a change adds version 2 and keeps version 1 untouched", async () => {
    const v1 = await getCurrentRules(db);
    const v2 = await saveNewVersion(db, { ...DEFAULT_RULES, minCoverWeeks: 5 }, "Distributors are faster now", admin);
    expect(v2.version).toBe(2);
    const all = await listVersions(db);
    expect(all.map((v) => v.version)).toEqual([2, 1]);
    expect(all[1].settings.minCoverWeeks).toBe(6);
    expect(v1.id).not.toBe(v2.id);
  });
  it("the new thresholds really change the answer", () => {
    const sku = { skuId: "T", skuName: "T", perishability: "Low" as const, standardReorderQty: 100, weeks: Array(16).fill(100), stockOnHand: 550, openOrderQty: 0, isFestivalMonth: false };
    expect(assess(sku, DEFAULT_RULES).status).toBe("stockout"); // 5.5 weeks < 6
    expect(assess(sku, { ...DEFAULT_RULES, minCoverWeeks: 5 }).status).toBe("ok");
  });
});

describe("results tracker", () => {
  it("first full quarter is the one after launch (launch 19 Oct 2026)", () => {
    expect(fullQuarterLabels()).toEqual(["2027-Q1", "2027-Q2", "2027-Q3", "2027-Q4"]);
    expect(roleOf("2026-Q3")).toBe("before");
    expect(roleOf("2026-Q4")).toBe("launch");
    expect(roleOf("2027-Q2")).toBe("full2");
  });
  it("25% below the Rs 31 lakh midpoint is Rs 23.25 lakh", () => {
    expect(BASELINE_MID).toBe(31 * LAKH);
    expect(reductionVsBaseline(23.25 * LAKH)).toBeCloseTo(0.25, 5);
  });
  it("verdicts", () => {
    expect(verdict("2027-Q2", 22 * LAKH).tone).toBe("good");
    expect(verdict("2027-Q2", 27 * LAKH).tone).toBe("warn"); // 12.9% cut
    expect(verdict("2027-Q2", 30 * LAKH).tone).toBe("bad");
    expect(verdict("2027-Q1", 30 * LAKH).tone).toBe("warn");
    expect(verdict("2026-Q4", 30 * LAKH).tone).toBe("neutral");
  });

  let db: Db;
  let planner: { id: string; role: string };
  let backup: { id: string; role: string };
  beforeAll(async () => {
    db = await createDb({ memory: true });
    const us = await ensureUsers(db);
    planner = us.find((u) => u.role === "planner")!;
    backup = us.find((u) => u.role === "backup")!;
  }, 60_000);
  it("stores losses in rupees from lakh, and a repeat entry corrects the quarter", async () => {
    await saveLoss(db, { quarter: "2027-q1", stockoutLakh: 14.5, overstockLakh: 9 }, planner);
    await saveLoss(db, { quarter: "2027-Q1", stockoutLakh: 12, overstockLakh: 9, note: "Corrected" }, planner);
    const rows = await listLosses(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quarter: "2027-Q1", stockoutInr: 1_200_000, overstockInr: 900_000, note: "Corrected" });
  });
  it("rejects bad input and the backup approver", async () => {
    await expect(saveLoss(db, { quarter: "Q1", stockoutLakh: 1, overstockLakh: 1 }, planner)).rejects.toBeInstanceOf(ResultsError);
    await expect(saveLoss(db, { quarter: "2027-Q2", stockoutLakh: -1, overstockLakh: 1 }, planner)).rejects.toBeInstanceOf(ResultsError);
    await expect(saveLoss(db, { quarter: "2027-Q2", stockoutLakh: 1450000, overstockLakh: 1 }, planner)).rejects.toThrow(/in lakh/);
    await expect(saveLoss(db, { quarter: "2027-Q2", stockoutLakh: 1, overstockLakh: 1 }, backup)).rejects.toBeInstanceOf(ResultsError);
  });
});
