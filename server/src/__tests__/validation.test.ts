import { describe, expect, it } from "vitest";
import { validatePassword } from "../lib/validation.js";

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
    expect(validatePassword("1234567")).toEqual({ ok: false, reason: "password must be >= 8 chars" });
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
    expect(validatePassword(overLimitAscii)).toEqual({ ok: false, reason: "password exceeds bcrypt 72-byte limit" });

    // A single emoji (e.g., 🦄) is 4 bytes.
    // 18 emojis * 4 bytes/emoji = 72 bytes. String length is 36.
    const exactLimitEmoji = "🦄".repeat(18);
    expect(validatePassword(exactLimitEmoji)).toEqual({ ok: true, value: exactLimitEmoji });

    // 19 emojis * 4 bytes/emoji = 76 bytes. String length is 38.
    const overLimitEmoji = "🦄".repeat(19);
    expect(validatePassword(overLimitEmoji)).toEqual({ ok: false, reason: "password exceeds bcrypt 72-byte limit" });
  });
});
