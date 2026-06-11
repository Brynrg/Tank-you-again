import { describe, it, expect } from "vitest";
import { debitFuel, creditFuel } from "../sim/economy";
import { MAX_FUEL, type TankState } from "../types";

describe("economy", () => {
  describe("creditFuel", () => {
    it("adds fuel up to MAX_FUEL", () => {
      const tank: Partial<TankState> = { isDead: false, fuel: 500 };
      creditFuel(tank as TankState, 200);
      expect(tank.fuel).toBe(700);
    });

    it("clamps fuel at MAX_FUEL", () => {
      const tank: Partial<TankState> = { isDead: false, fuel: 900 };
      creditFuel(tank as TankState, 200);
      expect(tank.fuel).toBe(MAX_FUEL);
    });

    it("does not add fuel if tank is dead", () => {
      const tank: Partial<TankState> = { isDead: true, fuel: 500 };
      creditFuel(tank as TankState, 200);
      expect(tank.fuel).toBe(500);
    });
  });

  describe("debitFuel", () => {
    it("returns false and does not debit if tank is dead", () => {
      const tank: Partial<TankState> = { isDead: true, fuel: 500 };
      const success = debitFuel(tank as TankState, 100, "MOVE");
      expect(success).toBe(false);
      expect(tank.fuel).toBe(500);
    });

    it("returns true and does not debit if amount <= 0", () => {
      const tank: Partial<TankState> = { isDead: false, fuel: 500 };
      const success = debitFuel(tank as TankState, 0, "MOVE");
      expect(success).toBe(true);
      expect(tank.fuel).toBe(500);

      const successNegative = debitFuel(tank as TankState, -100, "MOVE");
      expect(successNegative).toBe(true);
      expect(tank.fuel).toBe(500);
    });

    it("debits fuel and returns true if tank has enough fuel", () => {
      const tank: Partial<TankState> = { isDead: false, fuel: 500 };
      const success = debitFuel(tank as TankState, 100, "MOVE");
      expect(success).toBe(true);
      expect(tank.fuel).toBe(400);
    });

    it("refuses to debit and returns false if tank does not have enough fuel", () => {
      const tank: Partial<TankState> = { isDead: false, fuel: 50 };
      const success = debitFuel(tank as TankState, 100, "MOVE");
      expect(success).toBe(false);
      expect(tank.fuel).toBe(50);
    });

    it("allows DAMAGE debit even if fuel drops below 0 and clamps to 0", () => {
      const tank: Partial<TankState> = { isDead: false, fuel: 50 };
      const success = debitFuel(tank as TankState, 100, "DAMAGE");
      expect(success).toBe(true);
      expect(tank.fuel).toBe(0);
    });

    it("allows DAMAGE debit if fuel is sufficient", () => {
      const tank: Partial<TankState> = { isDead: false, fuel: 200 };
      const success = debitFuel(tank as TankState, 100, "DAMAGE");
      expect(success).toBe(true);
      expect(tank.fuel).toBe(100);
    });
  });
});
