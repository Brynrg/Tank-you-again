import { describe, expect, it } from "vitest";
import { validatePassword, validateUsername, sanitizeChat } from "../lib/validation.js";

describe("validatePassword", () => {
  it("rejects non-string inputs", () => {
    expect(validatePassword(null)).toEqual({ ok: false, reason: "password must be a string" });
    expect(validatePassword(123)).toEqual({ ok: false, reason: "password must be a string" });
    expect(validatePassword({})).toEqual({ ok: false, reason: "password must be a string" });
    expect(validatePassword(undefined)).toEqual({ ok: false, reason: "password must be a string" });
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("")).toEqual({ ok: false, reason: "password must be >= 8 chars" });
    expect(validatePassword("short")).toEqual({ ok: false, reason: "password must be >= 8 chars" });
    expect(validatePassword("1234567")).toEqual({
      ok: false,
      reason: "password must be >= 8 chars",
    });
  });

  it("accepts valid passwords within length limits", () => {
    expect(validatePassword("validpassword")).toEqual({ ok: true, value: "validpassword" });
    expect(validatePassword("12345678")).toEqual({ ok: true, value: "12345678" });
    expect(validatePassword("!@#$%^&*()_+")).toEqual({ ok: true, value: "!@#$%^&*()_+" });
  });

  it("enforces the bcrypt 72-byte limit", () => {
    // 72 ASCII characters = 72 bytes
    const exactLimitAscii = "a".repeat(72);
    expect(validatePassword(exactLimitAscii)).toEqual({ ok: true, value: exactLimitAscii });

    // 73 ASCII characters = 73 bytes
    const overLimitAscii = "a".repeat(73);
    expect(validatePassword(overLimitAscii)).toEqual({
      ok: false,
      reason: "password exceeds bcrypt 72-byte limit",
    });

    // A single emoji (e.g., 🦄) is 4 bytes.
    // 18 emojis * 4 bytes/emoji = 72 bytes. String length is 36.
    const exactLimitEmoji = "🦄".repeat(18);
    expect(validatePassword(exactLimitEmoji)).toEqual({ ok: true, value: exactLimitEmoji });

    // 19 emojis * 4 bytes/emoji = 76 bytes. String length is 38.
    const overLimitEmoji = "🦄".repeat(19);
    expect(validatePassword(overLimitEmoji)).toEqual({
      ok: false,
      reason: "password exceeds bcrypt 72-byte limit",
    });
  });
});

describe("validateUsername", () => {
  it("accepts a valid username", () => {
    const result = validateUsername("player123");
    expect(result).toEqual({ ok: true, value: "player123" });
  });

  it("trims whitespace and accepts if valid", () => {
    const result = validateUsername("  player123  ");
    expect(result).toEqual({ ok: true, value: "player123" });
  });

  it("accepts valid characters (letters, digits, underscore, hyphen)", () => {
    const result = validateUsername("A-z_0-9");
    expect(result).toEqual({ ok: true, value: "A-z_0-9" });
  });

  it("rejects non-string inputs", () => {
    expect(validateUsername(123)).toEqual({
      ok: false,
      reason: "username must be a string",
    });
    expect(validateUsername(null)).toEqual({
      ok: false,
      reason: "username must be a string",
    });
    expect(validateUsername(undefined)).toEqual({
      ok: false,
      reason: "username must be a string",
    });
    expect(validateUsername({})).toEqual({
      ok: false,
      reason: "username must be a string",
    });
  });

  it("rejects strings that are too short (< 3 chars)", () => {
    const reason = "username must be 3-16 chars, letters/digits/underscore/hyphen only";
    expect(validateUsername("ab")).toEqual({ ok: false, reason });
  });

  it("rejects strings that are too long (> 16 chars)", () => {
    const reason = "username must be 3-16 chars, letters/digits/underscore/hyphen only";
    expect(validateUsername("thisusernameistoolong")).toEqual({ ok: false, reason });
  });

  it("rejects strings with invalid characters", () => {
    const reason = "username must be 3-16 chars, letters/digits/underscore/hyphen only";
    expect(validateUsername("player@123")).toEqual({ ok: false, reason });
    expect(validateUsername("player 123")).toEqual({ ok: false, reason });
    expect(validateUsername("player!123")).toEqual({ ok: false, reason });
    expect(validateUsername("player#123")).toEqual({ ok: false, reason });
  });
});

describe("sanitizeChat", () => {
  it("allows standard letters, numbers, spaces, and basic punctuation", () => {
    const input = "Hello, world! 123? Yes-it is.";
    const result = sanitizeChat(input);
    expect(result).toEqual({ ok: true, value: input });
  });

  it("fails if input is not a string", () => {
    expect(sanitizeChat(null)).toEqual({ ok: false, reason: "chat must be a string" });
    expect(sanitizeChat(undefined)).toEqual({ ok: false, reason: "chat must be a string" });
    expect(sanitizeChat(123)).toEqual({ ok: false, reason: "chat must be a string" });
    expect(sanitizeChat({})).toEqual({ ok: false, reason: "chat must be a string" });
  });

  it("trims whitespace from the ends", () => {
    const result = sanitizeChat("  hello  ");
    expect(result).toEqual({ ok: true, value: "hello" });
  });

  it("removes control characters, HTML/JS sigils, and emojis", () => {
    const input = "hi <script> \u0000 😃";
    const result = sanitizeChat(input);
    expect(result).toEqual({ ok: true, value: "hi script" });
  });

  it("fails if string is empty after scrubbing", () => {
    expect(sanitizeChat("")).toEqual({ ok: false, reason: "chat is empty after scrubbing" });
    expect(sanitizeChat("   ")).toEqual({ ok: false, reason: "chat is empty after scrubbing" });
    expect(sanitizeChat("<>")).toEqual({ ok: false, reason: "chat is empty after scrubbing" });
    expect(sanitizeChat("😃")).toEqual({ ok: false, reason: "chat is empty after scrubbing" });
  });

  it("truncates strings longer than 200 characters", () => {
    const input = "a".repeat(250);
    const result = sanitizeChat(input);
    expect(result).toEqual({ ok: true, value: "a".repeat(200) });
  });

  it("handles non-English letters properly", () => {
    const input = "café über ñ";
    const result = sanitizeChat(input);
    expect(result).toEqual({ ok: true, value: "café über ñ" });
  });
});
