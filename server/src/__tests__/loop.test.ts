import { describe, expect, it } from "vitest";

import {
  MAX_FUEL,
  MilitaryRank,
  ProjectileKind,
  ClientMessageType,
  type ClientInputMessage,
  type ClientFireMessage,
} from "@shared/types";

import { RoomLoop } from "../loop.js";
import type { Connection } from "../connection.js";
import { TeamColor } from "@shared/types";

function makeFakeConnection(): Connection {
  const sent: string[] = [];
  const socket = {
    readyState: 1,
    OPEN: 1,
    send: (s: string) => sent.push(s),
    close: () => {},
  };
  const conn: Connection = {
    id: "c1",
    socket: socket as unknown as Connection["socket"],
    playerId: "p1",
    tankId: "",
    name: "",
    team: TeamColor.BLUE,
    lastInputTick: 0,
    lastChatTick: -1_000_000,
    lastBulletTick: -1_000_000,
    lastMissileTick: -1_000_000,
    lastMineTick: -1_000_000,
  };
  (conn as unknown as { sentMessages: string[] }).sentMessages = sent;
  return conn;
}

describe("RoomLoop", () => {
  it("advances tickIndex and spawns a tank for an added connection", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    const tank = room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    expect(tank.id).toBe("t1");
    expect(room.tickIndex).toBe(0);
    room.forceTick();
    expect(room.tickIndex).toBe(1);
    expect(room.getTanksForTesting().has("t1")).toBe(true);
  });

  it("applies INPUT and moves the tank in the requested direction", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    const tank = room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    const startX = tank.x;
    const startY = tank.y;
    const input: ClientInputMessage = {
      type: ClientMessageType.INPUT,
      clientTick: 1,
      up: false,
      down: false,
      left: false,
      right: true,
      aim: 0,
    };
    room.ingestInput("c1", input);
    for (let i = 0; i < 20; i++) room.forceTick();
    expect(tank.x).toBeGreaterThan(startX);
    expect(tank.y).toBe(startY);
  });

  it("debits fuel while moving", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    const tank = room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    expect(tank.fuel).toBe(MAX_FUEL);
    room.ingestInput("c1", {
      type: ClientMessageType.INPUT,
      clientTick: 1,
      up: false,
      down: false,
      left: false,
      right: true,
      aim: 0,
    });
    for (let i = 0; i < 60; i++) room.forceTick(); // 3 seconds at 20Hz
    expect(tank.fuel).toBeLessThan(MAX_FUEL);
  });

  it("fires a bullet on FIRE and emits it from the right owner", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    // Make sure spawn protection wears off so combat is meaningful for later tests
    for (let i = 0; i < 100; i++) room.forceTick();

    const fire: ClientFireMessage = {
      type: ClientMessageType.FIRE,
      weapon: ProjectileKind.BULLET,
      aim: 0,
    };
    room.handleFire("c1", fire);
    expect(room.getProjectilesForTesting().size).toBe(1);
    const proj = [...room.getProjectilesForTesting().values()][0]!;
    expect(proj.ownerId).toBe("t1");
    expect(proj.kind).toBe(ProjectileKind.BULLET);
  });

  it("removes a tank cleanly on removeConnection", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    expect(room.getTanksForTesting().has("t1")).toBe(true);
    room.removeConnection("c1");
    expect(room.getTanksForTesting().has("t1")).toBe(false);
  });

  it("is deterministic across runs with identical inputs", () => {
    function trace(): string {
      const room = new RoomLoop();
      const conn = makeFakeConnection();
      const tank = room.addConnection({
        conn,
        tankId: "t1",
        name: "Recruit",
        rank: MilitaryRank.RECRUIT,
      });
      // Pin spawn coords so Math.random in pickSpawnPoint doesn't diverge runs.
      tank.x = 200;
      tank.y = 200;
      const seqRight: ClientInputMessage = {
        type: ClientMessageType.INPUT,
        clientTick: 1,
        up: false,
        down: false,
        left: false,
        right: true,
        aim: 0,
      };
      const seqDown: ClientInputMessage = {
        type: ClientMessageType.INPUT,
        clientTick: 30,
        up: false,
        down: true,
        left: false,
        right: false,
        aim: 0,
      };
      room.ingestInput("c1", seqRight);
      for (let i = 0; i < 30; i++) room.forceTick();
      room.ingestInput("c1", seqDown);
      for (let i = 0; i < 30; i++) room.forceTick();
      return `${tank.x.toFixed(3)},${tank.y.toFixed(3)},${Math.round(tank.fuel)}`;
    }
    const a = trace();
    const b = trace();
    expect(a).toBe(b);
  });
});
