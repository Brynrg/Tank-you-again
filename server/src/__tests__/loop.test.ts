import { describe, expect, it } from "vitest";

import {
  FUEL_RADAR_SCAN,
  ItemType,
  MAX_FUEL,
  MilitaryRank,
  ProjectileKind,
  ClientMessageType,
  type ClientInputMessage,
  type ClientFireMessage,
  type ClientMoveToMessage,
  type ClientStopMessage,
  type GameStateSnapshot,
  type ServerSnapshotMessage,
} from "@shared/types";

import { RoomLoop } from "../loop.js";
import type { Connection } from "../connection.js";
import { TeamColor } from "@shared/types";

function makeFakeConnection(id = "c1", playerId = "p1"): Connection {
  const sent: string[] = [];
  const socket = {
    readyState: 1,
    OPEN: 1,
    send: (s: string) => sent.push(s),
    close: () => {},
  };
  const conn: Connection = {
    id,
    socket: socket as unknown as Connection["socket"],
    playerId,
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

function sentMessages(conn: Connection): string[] {
  return (conn as unknown as { sentMessages: string[] }).sentMessages;
}

function lastSnapshot(conn: Connection): GameStateSnapshot {
  const parsed = sentMessages(conn).map((raw) => JSON.parse(raw) as ServerSnapshotMessage);
  const snapshots = parsed.filter((msg) => msg.type === "SNAPSHOT");
  return snapshots.at(-1)!.snapshot;
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

  it("moves toward an authoritative MOVE_TO command", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    const tank = room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    tank.x = 200;
    tank.y = 200;

    const move: ClientMoveToMessage = {
      type: ClientMessageType.MOVE_TO,
      clientTick: 1,
      x: 320,
      y: 200,
    };
    room.ingestMoveTo("c1", move);
    for (let i = 0; i < 10; i++) room.forceTick();

    expect(tank.x).toBeGreaterThan(200);
    expect(tank.y).toBe(200);
    expect(tank.fuel).toBeLessThan(MAX_FUEL);
  });

  it("stops an active MOVE_TO command when STOP is ingested", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    const tank = room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    tank.x = 200;
    tank.y = 200;

    room.ingestMoveTo("c1", {
      type: ClientMessageType.MOVE_TO,
      clientTick: 1,
      x: 420,
      y: 200,
    });
    for (let i = 0; i < 5; i++) room.forceTick();

    const xAfterMoving = tank.x;
    const stop: ClientStopMessage = { type: ClientMessageType.STOP, clientTick: 2 };
    room.ingestStop("c1", stop);
    for (let i = 0; i < 10; i++) room.forceTick();

    expect(tank.x).toBe(xAfterMoving);
    expect(tank.y).toBe(200);
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

  it("hides distant pickups until an active radar scan reveals them", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    const tank = room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    tank.x = 500;
    tank.y = 500;
    room.getPickupsForTesting().set("pk1", {
      id: "pk1",
      type: ItemType.FUEL_CRATE,
      x: 800,
      y: 500,
    });

    room.forceTick();
    expect(lastSnapshot(conn).pickups).toHaveLength(0);

    const fuelBefore = tank.fuel;
    const radarBefore = tank.ammo.radar;
    room.handleUseItem("c1", { type: ClientMessageType.USE_ITEM, item: ItemType.RADAR });
    room.forceTick();

    expect(tank.fuel).toBe(fuelBefore - FUEL_RADAR_SCAN);
    expect(tank.ammo.radar).toBe(radarBefore - 1);
    expect(lastSnapshot(conn).pickups.map((pickup) => pickup.id)).toContain("pk1");
  });

  it("keeps enemy mines hidden until active radar reveals them per viewer", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    const tank = room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    tank.x = 500;
    tank.y = 500;
    room.getMinesForTesting().set("m1", {
      id: "m1",
      ownerId: "enemy",
      ownerTeam: TeamColor.RED,
      x: 750,
      y: 500,
      spawnTick: 0,
    });

    room.forceTick();
    expect(lastSnapshot(conn).visibleMines).toHaveLength(0);

    room.handleUseItem("c1", { type: ClientMessageType.USE_ITEM, item: ItemType.RADAR });
    room.forceTick();

    expect(lastSnapshot(conn).visibleMines.map((mine) => mine.id)).toContain("m1");
  });

  it("blocks radar scans when no radar equipment remains", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    const tank = room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    tank.ammo.radar = 0;
    const fuelBefore = tank.fuel;

    room.handleUseItem("c1", { type: ClientMessageType.USE_ITEM, item: ItemType.RADAR });

    expect(tank.fuel).toBe(fuelBefore);
    expect(tank.ammo.radar).toBe(0);
  });

  it("consumes one shield equipment when activating shield", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    const tank = room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    const shieldsBefore = tank.ammo.shields;

    room.handleUseItem("c1", { type: ClientMessageType.USE_ITEM, item: ItemType.SHIELD });

    expect(tank.hasShield).toBe(true);
    expect(tank.ammo.shields).toBe(shieldsBefore - 1);

    room.handleUseItem("c1", { type: ClientMessageType.USE_ITEM, item: ItemType.SHIELD });
    expect(tank.hasShield).toBe(false);
    expect(tank.ammo.shields).toBe(shieldsBefore - 1);
  });

  it("blocks shield activation when no shield equipment remains", () => {
    const room = new RoomLoop();
    const conn = makeFakeConnection();
    const tank = room.addConnection({
      conn,
      tankId: "t1",
      name: "Recruit",
      rank: MilitaryRank.RECRUIT,
    });
    tank.ammo.shields = 0;

    room.handleUseItem("c1", { type: ClientMessageType.USE_ITEM, item: ItemType.SHIELD });

    expect(tank.hasShield).toBe(false);
    expect(tank.ammo.shields).toBe(0);
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

describe("AIEnemies", () => {
  it("adds an AI enemy to the room", () => {
    const room = new RoomLoop();
    const ai = room.addAIEnemy("medium");
    expect(ai.getTank().name).toMatch(/AI-medium-/);
    expect(room.getTanksForTesting().size).toBe(1);
  });

  it("creates AI enemies with different difficulty levels", () => {
    const room = new RoomLoop();
    const easyAI = room.addAIEnemy("easy");
    const mediumAI = room.addAIEnemy("medium");
    const hardAI = room.addAIEnemy("hard");
    const expertAI = room.addAIEnemy("expert");

    expect(easyAI.getDifficulty()).toBe("easy");
    expect(mediumAI.getDifficulty()).toBe("medium");
    expect(hardAI.getDifficulty()).toBe("hard");
    expect(expertAI.getDifficulty()).toBe("expert");
  });

  it("assigns different teams to AI enemies", () => {
    const room = new RoomLoop();
    const ai1 = room.addAIEnemy("medium");
    const ai2 = room.addAIEnemy("medium");
    const ai3 = room.addAIEnemy("medium");

    const teams = [ai1.getTank().team, ai2.getTank().team, ai3.getTank().team];
    expect(new Set(teams).size).toBeGreaterThan(1);
  });
});
