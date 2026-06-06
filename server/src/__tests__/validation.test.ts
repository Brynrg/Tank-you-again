import { describe, it, expect } from "vitest";
import { sanitizeChat } from "../lib/validation";

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
