import { describe, expect, it, vi } from "vitest";
import { handleAuth } from "../auth.js";
import type { PrismaClient } from "@prisma/client";

describe("handleAuth", () => {
  it("rejects when token is provided", async () => {
    const prismaMock = {} as unknown as PrismaClient;
    const result = await handleAuth(prismaMock, { token: "some-token" });
    expect(result).toEqual({
      ok: false,
      reason: "token auth not yet supported — send guestName",
    });
  });

  it("rejects invalid guestName", async () => {
    const prismaMock = {} as unknown as PrismaClient;
    const result = await handleAuth(prismaMock, { guestName: "ab" }); // less than 3 chars
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("username must be 3-16 chars");
    }
  });

  it("creates user and tank for valid guestName", async () => {
    const mockUser = { id: "user-1", isGuest: true };
    const mockTank = { id: "tank-1", userId: "user-1", name: "Player1", rank: "RECRUIT" };

    const prismaMock = {
      user: {
        create: vi.fn().mockResolvedValue(mockUser),
      },
      tank: {
        create: vi.fn().mockResolvedValue(mockTank),
      },
    } as unknown as PrismaClient;

    const result = await handleAuth(prismaMock, { guestName: "Player1" });

    expect(result).toEqual({
      ok: true,
      user: mockUser,
      tank: mockTank,
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { isGuest: true },
    });
    expect(prismaMock.tank.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "Player1",
        rank: "RECRUIT",
        highestRank: "RECRUIT",
      },
    });
  });

  it("handles DB failures gracefully when prisma.user.create throws", async () => {
    const prismaMock = {
      user: {
        create: vi.fn().mockRejectedValue(new Error("DB connection lost")),
      },
      tank: {
        create: vi.fn(),
      },
    } as unknown as PrismaClient;

    const result = await handleAuth(prismaMock, { guestName: "Player1" });

    expect(result).toEqual({
      ok: false,
      reason: "auth/persist failed: DB connection lost",
    });
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.tank.create).not.toHaveBeenCalled();
  });

  it("handles DB failures gracefully when prisma.tank.create throws", async () => {
    const mockUser = { id: "user-1", isGuest: true };
    const prismaMock = {
      user: {
        create: vi.fn().mockResolvedValue(mockUser),
      },
      tank: {
        create: vi.fn().mockRejectedValue(new Error("Tank creation failed")),
      },
    } as unknown as PrismaClient;

    const result = await handleAuth(prismaMock, { guestName: "Player1" });

    expect(result).toEqual({
      ok: false,
      reason: "auth/persist failed: Tank creation failed",
    });
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.tank.create).toHaveBeenCalledTimes(1);
  });
});
