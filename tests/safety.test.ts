import { describe, expect, it } from "vitest";
import { type CatalogEntry, matchName, normalizeStrength } from "@/lib/safety/match";
import { courseEndDate, daysOfStockLeft, findDuplicateIngredients, needsRestock } from "@/lib/safety/medication-math";
import { expandShorthand } from "@/lib/safety/shorthand";
import { computeStatus, type Reading } from "@/lib/safety/status";

const catalog: CatalogEntry[] = [
  { id: "glyconil", name: "Glyconil 500", ingredients: ["metformin"], strength: "500 mg" },
  { id: "metsure", name: "Metsure SR 500", ingredients: ["metformin"], strength: "500 mg" },
  { id: "pressana", name: "Pressana 5", ingredients: ["amlodipine"], strength: "5 mg" },
  { id: "losarin", name: "Losarin 50", ingredients: ["losartan"], strength: "50 mg" },
  { id: "lasorin", name: "Lasorin 40", ingredients: ["furosemide"], strength: "40 mg" },
];

const good: Reading = { name: "Glyconil 500", strength: "500mg", doseCode: "1-0-1", durationDays: 30 };
const confirm = { catalogId: "glyconil", doseCode: "1-0-1", durationDays: 30 };

describe("shorthand table", () => {
  it.each([
    ["1-0-1", 2, ["morning", "night"]],
    ["1 - 0 - 1", 2, ["morning", "night"]],
    ["0-0-1", 1, ["night"]],
    ["TDS", 3, ["morning", "afternoon", "night"]],
    ["HS", 1, ["night"]],
    ["o.d.", 1, null],
    ["BD", 2, null],
    ["BID", 2, null],
  ])("%s → %d per day", (code, times, slots) => {
    const s = expandShorthand(code)!;
    expect(s.timesPerDay).toBe(times);
    expect(s.slots).toEqual(slots);
  });

  it('treats prescription "SOS" as "when needed", not emergency', () => {
    expect(expandShorthand("SOS")).toMatchObject({ asNeeded: true, timesPerDay: null, meaning: "when needed" });
  });

  it.each(["2-0-2", "1-0", "QHS", "", "take one", null])("unknown code %s → null (never guessed)", (code) => {
    expect(expandShorthand(code)).toBeNull();
  });
});

describe("catalog matching", () => {
  it("matches exactly after normalising form words and punctuation", () => {
    expect(matchName("Tab. GLYCONIL-500", catalog).exact?.id).toBe("glyconil");
  });
  it("never auto-picks a look-alike", () => {
    const m = matchName("Losorin 50", catalog);
    expect(m.exact).toBeNull();
    expect(m.candidates.map((c) => c.id).sort()).toEqual(["lasorin", "losarin"]);
  });
  it("normalises strengths", () => {
    expect(normalizeStrength("0.5 g")).toBe("500mg");
    expect(normalizeStrength("500 MG")).toBe("500mg");
  });
});

describe("computeStatus (Zero-Guess)", () => {
  it("is Verified only with agreeing readings + valid fields + human confirmation", () => {
    expect(computeStatus({ a: good, b: good, catalog, confirmation: confirm }).status).toBe("verified");
  });

  it("is never Verified without a person confirming", () => {
    const r = computeStatus({ a: good, b: good, catalog });
    expect(r.status).toBe("needs_check");
    expect(r.reasons).toContain("Please check and confirm.");
  });

  it("stays Needs check when the two readings find different medicines, even if a person confirms", () => {
    const r = computeStatus({
      a: { ...good, name: "Losarin 50", strength: "50 mg", doseCode: "1-0-0" },
      b: { ...good, name: "Lasorin 40", strength: "50 mg", doseCode: "1-0-0" },
      catalog,
      confirmation: { catalogId: "losarin", doseCode: "1-0-0", durationDays: 30 },
    });
    expect(r.status).toBe("needs_check");
  });

  it("lets a person resolve look-alikes only by picking the entry both readings agreed on", () => {
    const losarin = { name: "Losarin 50", strength: "50 mg", doseCode: "1-0-0", durationDays: 30 };
    expect(computeStatus({ a: losarin, b: losarin, catalog }).reasons.join(" ")).toMatch(/look alike/);
    expect(computeStatus({ a: losarin, b: losarin, catalog, confirmation: { catalogId: "losarin", doseCode: "1-0-0", durationDays: 30 } }).status).toBe("verified");
    expect(computeStatus({ a: losarin, b: losarin, catalog, confirmation: { catalogId: "lasorin", doseCode: "1-0-0", durationDays: 30 } }).status).toBe("needs_check");
  });

  it("rejects a strength that does not exist for that medicine", () => {
    const r = computeStatus({ a: { ...good, strength: "850 mg" }, b: { ...good, strength: "850 mg" }, catalog, confirmation: confirm });
    expect(r.status).toBe("needs_check");
  });

  it("rejects readings that disagree on strength, dose or days", () => {
    expect(computeStatus({ a: good, b: { ...good, strength: "5 mg" }, catalog, confirmation: confirm }).status).toBe("needs_check");
    expect(computeStatus({ a: good, b: { ...good, doseCode: "1-1-1" }, catalog, confirmation: confirm }).status).toBe("needs_check");
    expect(computeStatus({ a: good, b: { ...good, durationDays: 10 }, catalog, confirmation: confirm }).status).toBe("needs_check");
  });

  it("never auto-fills: missing duration needs a person to type it", () => {
    const missing = { ...good, durationDays: null };
    expect(computeStatus({ a: missing, b: missing, catalog }).status).toBe("needs_check");
    expect(computeStatus({ a: missing, b: missing, catalog, confirmation: { ...confirm, durationDays: 0 } }).status).toBe("needs_check");
    // A person reading the paper and typing the value is allowed.
    expect(computeStatus({ a: missing, b: missing, catalog, confirmation: confirm }).status).toBe("verified");
  });

  it("does not let a person overrule what both readings saw", () => {
    expect(computeStatus({ a: good, b: good, catalog, confirmation: { ...confirm, doseCode: "1-1-1" } }).status).toBe("needs_check");
    expect(computeStatus({ a: good, b: good, catalog, confirmation: { ...confirm, durationDays: 10 } }).status).toBe("needs_check");
  });

  it("rejects unknown dose codes", () => {
    const odd = { ...good, doseCode: "2-0-2" };
    expect(computeStatus({ a: odd, b: odd, catalog, confirmation: { ...confirm, doseCode: "2-0-2" } }).status).toBe("needs_check");
  });

  it("is Not recognized when nothing in the catalog is close", () => {
    const unknown = { name: "Zyxotrol 10", strength: "10 mg", doseCode: "OD", durationDays: 5 };
    expect(computeStatus({ a: unknown, b: unknown, catalog }).status).toBe("not_recognized");
    expect(computeStatus({ a: null, b: { ...unknown, name: null }, catalog }).status).toBe("not_recognized");
  });

  it("is Needs check (not Verified) when only one reading could read the name", () => {
    expect(computeStatus({ a: good, b: { ...good, name: null }, catalog, confirmation: confirm }).status).toBe("needs_check");
  });
});

describe("medication math", () => {
  it("finds duplicate active ingredients across prescriptions", () => {
    const d = findDuplicateIngredients([
      { id: "glyconil", name: "Glyconil 500", ingredients: ["Metformin"] },
      { id: "metsure", name: "Metsure SR 500", ingredients: ["metformin"] },
      { id: "pressana", name: "Pressana 5", ingredients: ["Amlodipine"] },
    ]);
    expect(d).toEqual([{ ingredient: "metformin", medicines: ["glyconil", "metsure"] }]);
  });

  it("computes stock days and restock threshold", () => {
    expect(daysOfStockLeft(14, 2)).toBe(7);
    expect(daysOfStockLeft(5, 0)).toBeNull();
    expect(needsRestock(8, 2)).toBe(true);
    expect(needsRestock(14, 2)).toBe(false);
  });

  it("computes the inclusive last day of a course", () => {
    expect(courseEndDate(new Date(2026, 10, 1), 5).getDate()).toBe(5);
  });
});

describe("matching name + strength and aligning readings", () => {
  it("matches a name written apart from its strength, exactly", () => {
    expect(matchName("Tab. Glyconil", catalog, "500 mg").exact?.id).toBe("glyconil");
    expect(matchName("Glyconil", catalog, "850 mg").exact).toBeNull();
    expect(matchName("Glyconil", catalog).exact).toBeNull();
  });

  it("verifies when readings split name and strength", () => {
    const r: Reading = { name: "Glyconil", strength: "500 mg", doseCode: "1-0-1", durationDays: 30 };
    expect(computeStatus({ a: r, b: r, catalog, confirmation: confirm }).status).toBe("verified");
  });

  it("pairs lines by name and pairs unreadable lines together", async () => {
    const { alignReadings } = await import("@/lib/safety/align");
    const pairs = alignReadings(
      [{ name: "Glyconil" }, { name: null }, { name: "Pressana" }],
      [{ name: "Pressana" }, { name: "Glyconil" }, { name: null }],
    );
    expect(pairs).toHaveLength(3);
    expect(pairs.map((p) => [p.a?.name, p.b?.name])).toEqual([["Glyconil", "Glyconil"], [null, null], ["Pressana", "Pressana"]]);
  });
});
