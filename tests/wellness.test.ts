import { describe, expect, it } from "vitest";
import { parseAlertDays, phoneDigits, shouldTouchActivity, validateCareSettings, weekAdherence, whatsappLink } from "@/lib/safety/wellness";

describe("activity throttle", () => {
  const now = new Date("2026-10-30T10:00:00Z");
  it("touches when never active or older than 10 minutes", () => {
    expect(shouldTouchActivity(null, now)).toBe(true);
    expect(shouldTouchActivity("2026-10-30T09:49:00Z", now)).toBe(true);
  });
  it("skips within 10 minutes", () => {
    expect(shouldTouchActivity("2026-10-30T09:55:00Z", now)).toBe(false);
  });
});

describe("weekly adherence (India time)", () => {
  // 30 Oct 2026, 10:00 IST
  const now = new Date("2026-10-30T04:30:00Z");
  it("returns 7 days ending today, oldest first", () => {
    const days = weekAdherence([], now);
    expect(days).toHaveLength(7);
    expect(days[6].date).toBe("2026-10-30");
    expect(days[0].date).toBe("2026-10-24");
    expect(days[6].day).toBe("Fri");
  });
  it("buckets by India date and ignores doses not yet due", () => {
    const days = weekAdherence(
      [
        { due_at: "2026-10-29T19:00:00Z", state: "taken" }, // 30 Oct 00:30 IST → today
        { due_at: "2026-10-29T03:00:00Z", state: "missed" }, // 29 Oct
        { due_at: "2026-10-29T14:00:00Z", state: "taken" }, // 29 Oct 19:30 IST
        { due_at: "2026-10-30T15:00:00Z", state: "pending" }, // later today: not counted
      ],
      now,
    );
    expect(days[6]).toMatchObject({ taken: 1, total: 1 });
    expect(days[5]).toMatchObject({ taken: 1, total: 2 });
  });
});

describe("contact links", () => {
  it("adds the India code to 10-digit numbers", () => {
    expect(phoneDigits("98470 12345")).toBe("919847012345");
    expect(phoneDigits("+91 98470 12345")).toBe("919847012345");
    expect(whatsappLink("9847012345", "hi there")).toBe("https://wa.me/919847012345?text=hi%20there");
  });
});

describe("care settings validation (same ranges as the DB)", () => {
  it("parses expiry alert days", () => {
    expect(parseAlertDays("7, 30, 0")).toEqual([30, 7, 0]);
    expect(parseAlertDays("abc")).toBeNull();
    expect(parseAlertDays("")).toBeNull();
  });
  it("accepts a valid patch and drops identity fields", () => {
    const r = validateCareSettings({ refill_days: 7, quiet_start: "21:30", presence: "away", name: "Hacker" });
    expect(r).toEqual({ patch: { refill_days: 7, quiet_start: "21:30", presence: "away" } });
  });
  it("rejects out-of-range values", () => {
    expect(validateCareSettings({ check_wait_min: 0 })).toHaveProperty("error");
    expect(validateCareSettings({ check_idle_hours: 25 })).toHaveProperty("error");
    expect(validateCareSettings({ quiet_end: "7pm" })).toHaveProperty("error");
    expect(validateCareSettings({ presence: "office" })).toHaveProperty("error");
    expect(validateCareSettings({})).toHaveProperty("error");
  });
});
