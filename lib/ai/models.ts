// All AI model choices in one place. Checked against the team's Gemini key on 2026-10-30
// (gemini-3.8-flash was overloaded, gemini-2.5-* not available to new accounts).

/** Reading A: careful transcription of the prescription photo. */
export const READING_A_MODEL = "gemini-3.5-flash";

/**
 * Reading B: a separate, blind second reading with a different model and prompt.
 * Used only until a Google Cloud Vision key is added — Vision is a truly independent engine.
 */
export const READING_B_MODEL = "gemini-3.5-flash-lite";

/** Voice companion and missed-dose escalation agents: fast replies. */
export const AGENT_MODEL = "gemini-3.5-flash-lite";

/** If a model is overloaded (503), try this one once instead. */
export const FALLBACK_MODEL = "gemini-3.5-flash-lite";

/**
 * How long the model "thinks" before answering. Measured 2026-10-30 on a prescription photo:
 * gemini-3.5-flash default ≈ 9.8 s, LOW ≈ 2–4 s, MINIMAL ≈ 1.8 s — same medicine names.
 * Reading A keeps a little reasoning for handwriting; everything else answers fast.
 */
export const READING_A_THINKING = "LOW";
export const FAST_THINKING = "MINIMAL";

/** Give up on one reading after this long and try the fallback model once. */
export const READING_TIMEOUT_MS = 15_000;
