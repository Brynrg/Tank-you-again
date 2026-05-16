// Input validation — all untrusted strings flow through here before they
// reach the DB, the WS broadcaster, or any log line. Validators return a
// discriminated result so callers can distinguish "bad input" from "DB error".

const USERNAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
const CHAT_ALLOWED_RE = /[^\p{L}\p{N}\s.,!?'"\-]/gu;

export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Strict alphanumeric (plus `_` and `-`) username, 3–16 chars.
 * Anything else is rejected — no normalization, no escaping.
 */
export function validateUsername(input: unknown): Validation<string> {
  if (typeof input !== "string") return { ok: false, reason: "username must be a string" };
  const trimmed = input.trim();
  if (!USERNAME_RE.test(trimmed)) {
    return {
      ok: false,
      reason: "username must be 3-16 chars, letters/digits/underscore/hyphen only",
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * Chat message scrubber: keep letters, digits, whitespace, and a small set of
 * punctuation; drop everything else (control chars, HTML/JS sigils, emoji
 * variation selectors, etc.). Hard-capped at 200 chars.
 */
export function sanitizeChat(input: unknown): Validation<string> {
  if (typeof input !== "string") return { ok: false, reason: "chat must be a string" };
  const scrubbed = input.replace(CHAT_ALLOWED_RE, "").trim().slice(0, 200);
  if (scrubbed.length === 0) return { ok: false, reason: "chat is empty after scrubbing" };
  return { ok: true, value: scrubbed };
}

/**
 * Passwords have looser rules than usernames — any printable codepoint is
 * fine; we only enforce a min length to keep bcrypt cost reasonable and a
 * max length so bcrypt doesn't truncate silently at 72 bytes.
 */
export function validatePassword(input: unknown): Validation<string> {
  if (typeof input !== "string") return { ok: false, reason: "password must be a string" };
  if (input.length < 8) return { ok: false, reason: "password must be >= 8 chars" };
  if (Buffer.byteLength(input, "utf8") > 72) {
    return { ok: false, reason: "password exceeds bcrypt 72-byte limit" };
  }
  return { ok: true, value: input };
}
