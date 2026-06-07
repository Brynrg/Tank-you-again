import { describe, it, expect } from "vitest";
import { debitFuel } from "../economy";
import { type TankState } from "../../types";

function makeFakeTank(fuel: number, isDead = false): TankState {
  return { fuel, isDead } as TankState;
}

describe("debitFuel", () => {
  it("returns false and does nothing if tank is dead", () => {
    const tank = makeFakeTank(100, true);
    expect(debitFuel(tank, 50, "MOVE")).toBe(false);
    expect(tank.fuel).toBe(100);
  });

  it("returns true and does nothing if amount is <= 0", () => {
    const tank = makeFakeTank(100, false);
    expect(debitFuel(tank, 0, "MOVE")).toBe(true);
    expect(tank.fuel).toBe(100);
    expect(debitFuel(tank, -10, "MOVE")).toBe(true);
    expect(tank.fuel).toBe(100);
  });

  it("debits fuel and returns true for standard reasons when sufficient fuel exists", () => {
    const tank = makeFakeTank(100, false);
    expect(debitFuel(tank, 30, "MOVE")).toBe(true);
    expect(tank.fuel).toBe(70);
  });

  it("returns false and does not debit fuel for standard reasons when insufficient fuel exists", () => {
    const tank = makeFakeTank(20, false);
    expect(debitFuel(tank, 30, "MOVE")).toBe(false);
    expect(tank.fuel).toBe(20);
  });

  it("debits fuel and returns true for DAMAGE even if insufficient fuel, clamping to 0", () => {
    const tank = makeFakeTank(20, false);
    expect(debitFuel(tank, 50, "DAMAGE")).toBe(true);
    expect(tank.fuel).toBe(0);
  });

  it("debits fuel and returns true for DAMAGE when sufficient fuel exists", () => {
    const tank = makeFakeTank(100, false);
    expect(debitFuel(tank, 40, "DAMAGE")).toBe(true);
    expect(tank.fuel).toBe(60);
  });
});
