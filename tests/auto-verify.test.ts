import { describe, expect, it } from "vitest";
import { autoVerify } from "@/lib/safety/auto-verify";
import type { CatalogEntry } from "@/lib/safety/match";

const catalog: CatalogEntry[] = [
  { id: "dolo-650", name: "Dolo 650", ingredients: ["paracetamol"], strength: "650 mg" },
  { id: "losarin", name: "Losarin 50", ingredients: ["losartan"], strength: "50 mg" },
  { id: "lasorin", name: "Lasorin 40", ingredients: ["furosemide"], strength: "40 mg" },
];
const r = (name: string | null, doseCode: string | null = "1-0-1", durationDays: number | null = 5) => ({ name, strength: null, doseCode, durationDays });

describe("autoVerify", () => {
  it("verifies when both readings agree, with no notes", () => {
    const v = autoVerify({ a: r("Dolo 650"), b: r("Dolo 650"), catalog });
    expect(v).toMatchObject({ status: "verified", catalogId: "dolo-650", doseCode: "1-0-1", durationDays: 5, notes: [] });
  });

  it("still verifies when the readings differ, and says so", () => {
    const v = autoVerify({ a: r("Losarin 50"), b: r("Lasorin 40"), catalog });
    expect(v.status).toBe("verified");
    expect(v.catalogId).toBe("losarin"); // reading 1 first
    expect(v.notes.join(" ")).toMatch(/second reading saw "Lasorin 40"/);
  });

  it("never invents timing or days — leaves them empty with a note", () => {
    const v = autoVerify({ a: r("Dolo 650", null, null), b: null, catalog });
    expect(v).toMatchObject({ status: "verified", doseCode: null, durationDays: null });
    expect(v.notes.join(" ")).toMatch(/No timing/);
    expect(v.notes.join(" ")).toMatch(/90 days/);
  });

  it("ignores dose codes that are not in the shorthand table", () => {
    expect(autoVerify({ a: r("Dolo 650", "2-0-2"), b: r("Dolo 650", "1-0-1"), catalog }).doseCode).toBe("1-0-1");
  });

  it("cannot turn an unreadable line into a medicine", () => {
    expect(autoVerify({ a: r(null), b: r("Zyxotrol 10"), catalog }).status).toBe("not_recognized");
  });
});
