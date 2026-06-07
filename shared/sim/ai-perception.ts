import type { TankState } from "@shared/types";
import { computeVisionSet } from "./vision.js";

export interface SensoryData {
  visibleTanks: TankState[];
  visibleProjectiles: any[];
  visibleMines: any[];
  visiblePickups: any[];
  enemyPositions: Map<string, { x: number; y: number }>;
  nearestEnemy: TankState | null;
  nearestPickup: any | null;
  threatLevel: number;
}

export class PerceptionSystem {
  sense(ai: TankState, world: any): SensoryData {
    // Use existing vision system
    const visionSet = this.computeVisionSet(ai, world);

    // Extract relevant data
    const visibleTanks = (
      (Array.isArray(world.tanks) ? world.tanks : Array.from(world.tanks || [])) as TankState[]
    ).filter((t) => visionSet.visibleTankIds?.has(t.id) && t.id !== ai.id);

    const visibleProjectiles = (
      (Array.isArray(world.projectiles)
        ? world.projectiles
        : Array.from(world.projectiles || [])) as any[]
    ).filter((p) => visionSet.visibleProjectileIds?.has(p.id));

    const visibleMines = (
      (Array.isArray(world.mines) ? world.mines : Array.from(world.mines || [])) as any[]
    ).filter((m) => visionSet.visibleMineIds?.has(m.id));

    const visiblePickups = (
      (Array.isArray(world.pickups) ? world.pickups : Array.from(world.pickups || [])) as any[]
    ).filter((p) => visionSet.visiblePickupIds?.has(p.id));

    // Find nearest enemy and pickup
    const nearestEnemy = this.findNearestEntity(ai, visibleTanks);
    const nearestPickup = this.findNearestEntity(ai, visiblePickups);

    // Calculate threat level
    const threatLevel = this.calculateThreatLevel(ai, visibleProjectiles, visibleTanks);

    return {
      visibleTanks,
      visibleProjectiles,
      visibleMines,
      visiblePickups,
      enemyPositions: this.buildEnemyPositionMap(visibleTanks),
      nearestEnemy,
      nearestPickup,
      threatLevel,
    };
  }

  private computeVisionSet(ai: TankState, world: any) {
    // Use existing vision system from sim/vision.ts. The shared computeVisionSet
    // needs the current tick (for radar-reveal expiry); pull it from the world
    // snapshot, defaulting to 0 when the AI is sensing a tickless view.
    return computeVisionSet(ai, world, world?.currentTick ?? 0);
  }

  private calculateThreatLevel(ai: TankState, projectiles: any[], enemies: TankState[]): number {
    let threat = 0;

    // Threat from nearby enemies
    for (const enemy of enemies) {
      const distance = Math.hypot(enemy.x - ai.x, enemy.y - ai.y);
      threat += 10 / (distance + 1);

      // Extra threat from enemies with shields
      if (enemy.hasShield) threat += 5;
    }

    // Threat from incoming projectiles
    for (const proj of projectiles) {
      const distance = Math.hypot(proj.x - ai.x, proj.y - ai.y);
      const direction = Math.atan2(proj.vy, proj.vx);
      const aiDirection = Math.atan2(ai.y - proj.y, ai.x - proj.x);
      const angleDiff = Math.abs(direction - aiDirection);

      if (angleDiff < Math.PI / 4) {
        // Projectiles heading toward AI
        threat += 20 / (distance + 1);
      }
    }

    return Math.min(threat, 100);
  }

  private findNearestEntity(ai: TankState, entities: any[]): any | null {
    if (entities.length === 0) return null;

    let nearest = entities[0];
    let minDistance = Math.hypot(nearest.x - ai.x, nearest.y - ai.y);

    for (let i = 1; i < entities.length; i++) {
      const distance = Math.hypot(entities[i].x - ai.x, entities[i].y - ai.y);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = entities[i];
      }
    }

    return nearest;
  }

  private buildEnemyPositionMap(enemies: TankState[]): Map<string, { x: number; y: number }> {
    const positionMap = new Map<string, { x: number; y: number }>();
    for (const enemy of enemies) {
      positionMap.set(enemy.id, { x: enemy.x, y: enemy.y });
    }
    return positionMap;
  }
}
