import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeAiError } from "@/lib/ai/errors";

describe("describeAiError", () => {
  const saved = process.env.GEMINI_API_KEY;
  beforeEach(() => (process.env.GEMINI_API_KEY = "test"));
  afterEach(() => (process.env.GEMINI_API_KEY = saved));

  it("explains the daily free limit with the wait time", () => {
    const p = describeAiError(new Error('{"error":{"code":429,"message":"Quota exceeded … GenerateRequestsPerDayPerProjectPerModel-FreeTier … Please retry in 3h38m58.07s."}}'));
    expect(p.kind).toBe("daily_limit");
    expect(p.status).toBe(429);
    expect(p.message).toMatch(/Today's free AI limit/);
    expect(p.message).toMatch(/about 3 hours 39 minutes/);
  });

  it("says 'busy' for a per-minute limit", () => {
    const p = describeAiError(new Error("429 RESOURCE_EXHAUSTED PerMinute Please retry in 41s."));
    expect(p).toMatchObject({ kind: "busy" });
    expect(p.message).toMatch(/a minute/);
  });

  it("recognises overload and timeouts", () => {
    expect(describeAiError(new Error("503 UNAVAILABLE: The model is overloaded")).kind).toBe("overloaded");
    expect(describeAiError(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })).kind).toBe("timeout");
  });

  it("says when the key is missing", () => {
    delete process.env.GEMINI_API_KEY;
    expect(describeAiError(new Error("anything")).kind).toBe("not_set_up");
  });
});
