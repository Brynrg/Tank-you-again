import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { MilitaryRank } from "@shared/types";
import { handleAuth } from "./auth.js";

describe("handleAuth", () => {
  it("rejects token authentication", async () => {
    const prisma = {} as PrismaClient;
    const result = await handleAuth(prisma, { token: "some-token" });
    expect(result).toEqual({ ok: false, reason: "token auth not yet supported — send guestName" });
  });

  it("rejects invalid guestName", async () => {
    const prisma = {} as PrismaClient;
    const result = await handleAuth(prisma, { guestName: "a" }); // Too short
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("username must be 3-16 chars");
    }
  });

  it("creates a user and tank for a valid guestName", async () => {
    const mockUser = { id: 123, isGuest: true };
    const mockTank = {
      id: 456,
      userId: 123,
      name: "ValidName",
      rank: MilitaryRank.RECRUIT,
      highestRank: MilitaryRank.RECRUIT,
    };

    const prisma = {
      user: {
        create: vi.fn().mockResolvedValue(mockUser),
      },
      tank: {
        create: vi.fn().mockResolvedValue(mockTank),
      },
    } as unknown as PrismaClient;

    const result = await handleAuth(prisma, { guestName: "ValidName" });

    expect(result).toEqual({ ok: true, user: mockUser, tank: mockTank });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { isGuest: true },
    });
    expect(prisma.tank.create).toHaveBeenCalledWith({
      data: {
        userId: 123,
        name: "ValidName",
        rank: MilitaryRank.RECRUIT,
        highestRank: MilitaryRank.RECRUIT,
      },
    });
  });

  it("handles database errors gracefully", async () => {
    const prisma = {
      user: {
        create: vi.fn().mockRejectedValue(new Error("DB Connection Error")),
      },
    } as unknown as PrismaClient;

    const result = await handleAuth(prisma, { guestName: "ValidName" });

    expect(result).toEqual({ ok: false, reason: "auth/persist failed: DB Connection Error" });
  });
});
