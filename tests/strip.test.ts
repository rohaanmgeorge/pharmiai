import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "@/lib/safety/match";
import { computeStripStatus, expiryBadge, formatExpiry, parseExpiry, type StripReading } from "@/lib/safety/strip";

// Fixed "today" so the year-range rule is stable: 30 Oct 2026.
const today = new Date("2026-10-30T12:00:00Z");

const catalog: CatalogEntry[] = [
  { id: "glyconil", name: "Glyconil 500", ingredients: ["metformin"], strength: "500 mg" },
  { id: "losarin", name: "Losarin 50", ingredients: ["losartan"], strength: "50 mg" },
  { id: "lasorin", name: "Lasorin 40", ingredients: ["furosemide"], strength: "40 mg" },
];

const good: StripReading = { brand: "Glyconil 500", strength: "500 mg", expiry: "EXP 03/2027", batch: "GX123" };
const confirm = { catalogId: "glyconil", expiry: "2027-03" };

describe("parseExpiry", () => {
  it.each([
    ["03/2027", "2027-03"],
    ["3/2027", "2027-03"],
    ["03/27", "2027-03"],
    ["03-2027", "2027-03"],
    ["MAR 2027", "2027-03"],
    ["Mar-27", "2027-03"],
    ["MAR.2027", "2027-03"],
    ["March 2027", "2027-03"],
    ["EXP 03/2027", "2027-03"],
    ["EXP. MAR 2027", "2027-03"],
    ["Expiry: 12/28", "2028-12"],
    ["2027-03", "2027-03"],
  ])("%s → %s", (text, expected) => {
    expect(parseExpiry(text, today)).toBe(expected);
  });

  it.each([
    ["00/2027"],
    ["13/2027"],
    ["MAX 2027"],
    ["12/03/2027"], // day-month-year is ambiguous: never guessed
    ["03/2040"], // more than 10 years ahead
    ["03/2019"], // more than 5 years back
    [""],
    ["unclear"],
  ])("rejects %s", (text) => {
    expect(parseExpiry(text, today)).toBeNull();
  });

  it("rejects null", () => expect(parseExpiry(null, today)).toBeNull());
});

describe("expiry badge", () => {
  it("counts to the end of the month", () => {
    expect(expiryBadge("2026-11-01", "2026-10-30")).toEqual({ badge: "ok", daysLeft: 31 }); // 30 Nov is 31 days away
    expect(expiryBadge("2026-11-01", "2026-10-31")).toEqual({ badge: "soon", daysLeft: 30 });
  });
  it("ok, soon, expired, needs check", () => {
    expect(expiryBadge("2027-03-01", "2026-10-30").badge).toBe("ok");
    expect(expiryBadge("2026-10-01", "2026-10-30").badge).toBe("soon");
    expect(expiryBadge("2026-09-01", "2026-10-30").badge).toBe("expired");
    expect(expiryBadge(null, "2026-10-30").badge).toBe("needs_check");
  });
  it("formats for display", () => expect(formatExpiry("2027-03-01")).toBe("Mar 2027"));
});

describe("computeStripStatus", () => {
  it("both readings agree → still needs a person to confirm", () => {
    const r = computeStripStatus({ a: good, b: { ...good, expiry: "MAR 2027" }, catalog, today });
    expect(r.status).toBe("needs_check");
    expect(r.catalogId).toBe("glyconil");
    expect(r.expiryRead).toBe("2027-03");
    expect(r.reasons).toContain("Please check and confirm.");
  });

  it("agree + matching confirmation → verified", () => {
    const r = computeStripStatus({ a: good, b: good, catalog, confirmation: confirm, today });
    expect(r.status).toBe("verified");
    expect(r.reasons).toEqual([]);
  });

  it("a person can't overrule an agreed expiry", () => {
    const r = computeStripStatus({ a: good, b: good, catalog, confirmation: { ...confirm, expiry: "2028-03" }, today });
    expect(r.status).toBe("needs_check");
    expect(r.reasons).toContain("Your expiry date differs from what is printed on the strip.");
  });

  it("readings disagree on expiry → not read; a person may type it", () => {
    const b = { ...good, expiry: "08/2027" };
    const before = computeStripStatus({ a: good, b, catalog, today });
    expect(before.expiryRead).toBeNull();
    expect(before.reasons.some((x) => x.includes("disagree on the expiry"))).toBe(true);
    const after = computeStripStatus({ a: good, b, catalog, confirmation: { ...confirm, expiry: "2027-08" }, today });
    expect(after.status).toBe("verified");
  });

  it("missing expiry → person types it; invalid typed month is rejected", () => {
    const a = { ...good, expiry: null };
    expect(computeStripStatus({ a, b: good, catalog, today }).expiryRead).toBeNull();
    expect(computeStripStatus({ a, b: good, catalog, confirmation: { ...confirm, expiry: "2027-13" }, today }).status).toBe("needs_check");
    expect(computeStripStatus({ a, b: good, catalog, confirmation: confirm, today }).status).toBe("verified");
  });

  it("missing name in one reading → never verified", () => {
    const r = computeStripStatus({ a: good, b: { ...good, brand: null }, catalog, confirmation: confirm, today });
    expect(r.status).toBe("needs_check");
    expect(r.catalogId).toBeNull();
  });

  it("readings found different medicines → never verified", () => {
    const b = { ...good, brand: "Losarin 50", strength: "50 mg" };
    const r = computeStripStatus({ a: good, b, catalog, confirmation: confirm, today });
    expect(r.status).toBe("needs_check");
    expect(r.reasons).toContain("The two readings found different medicines.");
  });

  it("look-alikes are listed, never auto-picked", () => {
    const los: StripReading = { brand: "Losarin 50", strength: "50 mg", expiry: "03/2027", batch: null };
    const r = computeStripStatus({ a: los, b: los, catalog, today });
    expect(r.status).toBe("needs_check");
    expect(r.candidates.map((c) => c.id).sort()).toEqual(["lasorin", "losarin"]);
    expect(r.reasons.some((x) => x.includes("look alike"))).toBe(true);
    // Choosing the look-alike that was NOT read is refused.
    expect(computeStripStatus({ a: los, b: los, catalog, confirmation: { catalogId: "lasorin", expiry: "2027-03" }, today }).status).toBe("needs_check");
    expect(computeStripStatus({ a: los, b: los, catalog, confirmation: { catalogId: "losarin", expiry: "2027-03" }, today }).status).toBe("verified");
  });

  it("wrong strength → never verified", () => {
    const a = { ...good, strength: "850 mg" };
    expect(computeStripStatus({ a, b: a, catalog, confirmation: confirm, today }).status).toBe("needs_check");
  });

  it("unknown medicine → not recognized", () => {
    const x: StripReading = { brand: "Zzzqx 10", strength: "10 mg", expiry: "03/2027", batch: null };
    expect(computeStripStatus({ a: x, b: x, catalog, today }).status).toBe("not_recognized");
  });

  it("batch is optional and never blocks", () => {
    const r = computeStripStatus({ a: { ...good, batch: null }, b: { ...good, batch: "OTHER" }, catalog, confirmation: confirm, today });
    expect(r.status).toBe("verified");
    expect(computeStripStatus({ a: good, b: { ...good, batch: "OTHER" }, catalog, today }).batchRead).toBeNull();
  });
});
