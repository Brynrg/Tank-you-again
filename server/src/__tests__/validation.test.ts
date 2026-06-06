import { describe, it, expect } from "vitest";
import { validateUsername } from "../lib/validation";

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
