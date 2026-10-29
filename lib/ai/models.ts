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
