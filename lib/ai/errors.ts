// Turns a Gemini error into a plain sentence for the person, plus an HTTP status for our API.
// Google's errors look like: 429 RESOURCE_EXHAUSTED … "PerDay" … "Please retry in 3h38m58s".

export type AiProblem = { kind: "daily_limit" | "busy" | "overloaded" | "timeout" | "not_set_up" | "failed"; status: number; message: string };

/** "3h38m58.07s" → "about 3 hours 39 minutes" (rounded, friendly). */
function friendlyWait(raw: string | undefined): string | null {
  if (!raw) return null;
  const h = Number(raw.match(/(\d+)h/)?.[1] ?? 0);
  const m = Number(raw.match(/(\d+)m(?!s)/)?.[1] ?? 0);
  const s = Number(raw.match(/([\d.]+)s/)?.[1] ?? 0);
  const total = h * 60 + m + (s >= 30 ? 1 : 0);
  if (total <= 1) return "a minute";
  if (total < 60) return `about ${total} minutes`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `about ${hours} hour${hours === 1 ? "" : "s"}${mins ? ` ${mins} minutes` : ""}`;
}

export function describeAiError(e: unknown): AiProblem {
  const text = e instanceof Error ? e.message : String(e ?? "");
  if (!process.env.GEMINI_API_KEY) return { kind: "not_set_up", status: 503, message: "The AI is not set up on the server yet (missing Gemini key)." };
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(text)) {
    const wait = friendlyWait(text.match(/retry in ([\dhms.]+)/i)?.[1]);
    if (/PerDay/i.test(text)) {
      return {
        kind: "daily_limit",
        status: 429,
        message: `Today's free AI limit has been reached. Please try again in ${wait ?? "a few hours"}. (Turning on billing for the Gemini key removes this limit.)`,
      };
    }
    return { kind: "busy", status: 429, message: `The AI is getting too many requests right now. Please wait ${wait ?? "a minute"} and try again.` };
  }
  if (/503|UNAVAILABLE|overloaded/i.test(text)) return { kind: "overloaded", status: 503, message: "Google's AI is overloaded at the moment. Please try again in a minute." };
  if (/abort|timeout|timed out/i.test(text) || (e instanceof Error && e.name === "TimeoutError")) {
    return { kind: "timeout", status: 504, message: "The AI took too long to answer. Please check your internet and try again." };
  }
  return { kind: "failed", status: 502, message: "The AI could not finish this. Please try again." };
}
