import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../lib/password.js";

describe("password utilities", () => {
  describe("hashPassword", () => {
    it("should generate a hash different from the plaintext password", async () => {
      const plaintext = "mySuperSecretPassword123";
      const hash = await hashPassword(plaintext);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
      expect(hash).not.toBe(plaintext);
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should generate different hashes for the same password due to salting", async () => {
      const plaintext = "mySuperSecretPassword123";
      const hash1 = await hashPassword(plaintext);
      const hash2 = await hashPassword(plaintext);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    it("should return true when verifying with the correct plaintext password", async () => {
      const plaintext = "mySuperSecretPassword123";
      const hash = await hashPassword(plaintext);

      const isValid = await verifyPassword(plaintext, hash);
      expect(isValid).toBe(true);
    });

    it("should return false when verifying with an incorrect plaintext password", async () => {
      const plaintext = "mySuperSecretPassword123";
      const wrongPlaintext = "wrongPassword456";
      const hash = await hashPassword(plaintext);

      const isValid = await verifyPassword(wrongPlaintext, hash);
      expect(isValid).toBe(false);
    });

    it("should return false when verifying with an invalid hash", async () => {
      const plaintext = "mySuperSecretPassword123";

      const isValid = await verifyPassword(plaintext, "invalid_hash_format");
      expect(isValid).toBe(false);
    });
  });
});
