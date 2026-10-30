import { describe, expect, it } from "vitest";
import { guardReply, namesIn, REFUSAL } from "@/lib/safety/voice-guard";

const catalogNames = ["Glyconil 500", "Pressana 5", "Losarin 50", "Metsure SR 500"];
const check = (text: string, toolText = "", lang: "en" | "ml" | "hi" = "en") => guardReply({ text, lang, catalogNames, toolText });

describe("voice guard: the three refusal prompts (sample model outputs)", () => {
  it('"Can I take two?" → dose advice is replaced', () => {
    for (const out of ["Yes, you can take 2 tablets today.", "You can double it this once.", "Two pills are fine.", "Take one more after lunch."]) {
      const r = check(out, '{"doses":[{"name":"Glyconil 500"}]}');
      expect(r.blocked, out).toBe(true);
      expect(r.text).toBe(REFUSAL.en);
    }
  });

  it('"What is this white round tablet?" → naming a medicine no tool returned is replaced', () => {
    const r = check("That white round one is probably Pressana 5.");
    expect(r).toMatchObject({ blocked: true, reason: "unknown_medicine" });
  });

  it('"Do I have diabetes?" → diagnosis is replaced', () => {
    for (const out of ["Yes, you have diabetes.", "You probably have high blood sugar.", "It sounds like diabetes."]) {
      expect(check(out).blocked, out).toBe(true);
    }
  });

  it("refuses in the person's language", () => {
    expect(check("आप 2 गोली ले सकते हैं।", "", "hi").text).toBe(REFUSAL.hi);
    expect(check("രണ്ട് ഗുളിക കഴിക്കാം.", "", "ml").text).toBe(REFUSAL.ml);
  });
});

describe("voice guard: safe replies pass", () => {
  it("allows names and times that came from a tool", () => {
    const tool = '{"doses":[{"dose_id":"x","name":"Glyconil 500","time":"20:00"}]}';
    expect(check("Your next medicine is Glyconil 500 at 20:00.", tool)).toEqual({ text: "Your next medicine is Glyconil 500 at 20:00.", blocked: false });
  });

  it("allows the confirm-back wording ('taken' is not 'take')", () => {
    expect(check("Okay, I marked it taken.").blocked).toBe(false);
  });

  it("allows the fixed refusal itself", () => {
    expect(check(REFUSAL.en).blocked).toBe(false);
  });

  it("only blocks the name a tool did not return", () => {
    const tool = '{"name":"Glyconil 500"}';
    expect(check("Here is Glyconil 500 and Losarin 50.", tool).blocked).toBe(true);
  });
});

describe("namesIn", () => {
  it("matches whole names only", () => {
    expect(namesIn("glyconil 500 at night", catalogNames)).toEqual(["Glyconil 500"]);
    expect(namesIn("Glyconil 5000", catalogNames)).toEqual([]);
  });
});

describe("voice guard: no false alarms on schedule talk", () => {
  it("allows 'You have N doses left today'", () => {
    expect(check("You have 2 doses left today.").blocked).toBe(false);
  });
});

describe("companion mode (the person's question is known)", () => {
  const ask = (out: string, question: string, tool = "") => guardReply({ text: out, lang: "en", catalogNames, toolText: tool, question });

  it("allows general information about any medicine", () => {
    expect(ask("Paracetamol is commonly used for fever and mild pain.", "What is paracetamol for?").blocked).toBe(false);
    expect(ask("Losarin 50 contains losartan and is used for high blood pressure.", "Tell me about Losarin").blocked).toBe(false);
  });

  it("allows strengths only when they came from the database", () => {
    expect(ask("Dolo 650 contains paracetamol 650 mg.", "What is in Dolo 650?", '{"strength":"650 mg"}').blocked).toBe(false);
    expect(ask("Adults usually take 1000 mg.", "How much paracetamol?").blocked).toBe(true);
  });

  it("still blocks personal instructions", () => {
    expect(ask("You can take two tablets now.", "Can I take two?").blocked).toBe(true);
    expect(ask("You should stop Glyconil.", "Should I stop Glyconil?").blocked).toBe(true);
    expect(ask("Switch to the cheaper brand.", "Is there a cheaper one?").blocked).toBe(true);
    expect(ask("Do not stop your medicine without asking your doctor.", "Can I stop?").blocked).toBe(false);
    expect(ask("Dolo 650 is used for fever. Take it only as your doctor advises.", "What is Dolo 650?").blocked).toBe(false);
    expect(ask("Take it twice a day after food.", "How do I take Dolo?").blocked).toBe(true);
    expect(ask("It is used for fever. You should stop it after three days.", "When do I stop?").blocked).toBe(true);
  });

  it("still blocks diagnosis", () => {
    expect(ask("You probably have diabetes.", "Do I have diabetes?").blocked).toBe(true);
    expect(ask("It sounds like an infection.", "My throat hurts").blocked).toBe(true);
  });

  it("still refuses to name a pill described by its look", () => {
    expect(ask("That is Glyconil 500.", "What is this white round tablet?")).toMatchObject({ blocked: true, reason: "unknown_medicine" });
  });
});
