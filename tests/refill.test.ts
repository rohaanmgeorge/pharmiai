import { describe, expect, it } from "vitest";
import { predictRunout } from "@/lib/safety/medication-math";
import { checkRefillDraft, type RefillInput, refillQuantity, refillTemplate, safeRefillText, shareUrl } from "@/lib/safety/refill-guard";

const catalog = ["Glyconil 500", "Glyconil 850", "Pressana 5", "Losarin 50", "Lasorin 40"];
const input: RefillInput = { medicine: "Glyconil 500", strength: "500 mg", quantity: 60, pharmacy: "Care Pharmacy", patient: "Amma" };

describe("refill quantity and run-out (code, never AI)", () => {
  it("orders 30 days' worth", () => {
    expect(refillQuantity(2)).toBe(60);
    expect(refillQuantity(3, 10)).toBe(30);
  });
  it("8 tablets at 2 a day run out in 4 days", () => {
    expect(predictRunout(8, 2, "2026-10-30")).toEqual({ daysLeft: 4, runoutDate: "2026-11-03" });
  });
});

describe("refill draft guard", () => {
  it("accepts a plain polite reorder", () => {
    const text = "Hello Care Pharmacy, please keep 60 strips-worth of Glyconil 500 (500 mg) ready for Amma. Thank you!";
    expect(checkRefillDraft(text, input, catalog)).toEqual([]);
  });

  it("rejects a different medicine name", () => {
    expect(checkRefillDraft("Please send 60 Glyconil 500 and Pressana 5.", input, catalog)).toContain("other_medicine");
    expect(checkRefillDraft("Please send 60 Glyconil 850.", input, catalog)).toContain("other_medicine");
  });

  it("rejects when our medicine is missing", () => {
    expect(checkRefillDraft("Please send 60 tablets.", input, catalog)).toContain("medicine_missing");
  });

  it("rejects numbers we did not supply (also in Hindi/Malayalam digits)", () => {
    expect(checkRefillDraft("Please send 90 Glyconil 500.", input, catalog)).toContain("unknown_number");
    expect(checkRefillDraft("Glyconil 500 ९० चाहिए", input, catalog)).toContain("unknown_number");
    expect(checkRefillDraft("Glyconil 500 ൯൦ വേണം", input, catalog)).toContain("unknown_number");
  });

  it.each([
    "Glyconil 500, 60 please. Take one twice daily.",
    "Glyconil 500, 60 please. Increase it if needed.",
    "Glyconil 500, 60 please. Stop the old one.",
    "Glyconil 500 (500 mg per day), 60 please.",
    "Glyconil 500, 60 എണ്ണം. ദിവസവും കഴിക്കുക.",
    "Glyconil 500, 60 गोलियाँ। रोज़ दो बार लें।",
  ])("rejects dose advice: %s", (text) => {
    expect(checkRefillDraft(text, input, catalog)).toContain("dose_advice");
  });

  it("falls back to the template when a draft is rejected or missing", () => {
    const bad = safeRefillText("Take Glyconil 500 twice daily", "en", input, catalog);
    expect(bad.source).toBe("template");
    expect(bad.text).toBe(refillTemplate("en", input));
    expect(safeRefillText(null, "ml", input, catalog).text).toBe(refillTemplate("ml", input));
  });

  it.each(["en", "ml", "hi"] as const)("the %s template passes its own guard", (lang) => {
    expect(checkRefillDraft(refillTemplate(lang, input), input, catalog)).toEqual([]);
    expect(checkRefillDraft(refillTemplate(lang, { ...input, pharmacy: "", patient: "" }), input, catalog)).toEqual([]);
  });
});

describe("share links (user opens them; we never send)", () => {
  it("builds WhatsApp, SMS and email links", () => {
    expect(shareUrl("whatsapp", "hi there", { phone: "98470 12345" })).toBe("https://wa.me/919847012345?text=hi%20there");
    expect(shareUrl("sms", "hi", { phone: "+91 98470 12345" })).toBe("sms:+919847012345?body=hi");
    expect(shareUrl("email", "hi", { email: "shop@example.com" })).toBe("mailto:shop@example.com?subject=Medicine%20refill&body=hi");
  });
  it("returns null when the pharmacy contact is missing", () => {
    expect(shareUrl("whatsapp", "hi", { phone: "" })).toBeNull();
    expect(shareUrl("email", "hi", { email: null })).toBeNull();
  });
});
