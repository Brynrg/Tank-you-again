# AI Enemies Implementation Execution Plan

## 🎯 Objective

Implement AI-controlled enemies to enable single-player mode in Tank-you-again while maintaining compatibility with existing multiplayer infrastructure.

## 📚 Research Summary

### Architecture Analysis

- **Server-Side Authority**: All game logic runs on server (RoomLoop class)
- **Modular Design**: Clean separation of concerns (world, movement, vision, combat, damage)
- **Event-Driven**: State changes handled through discrete events
- **Client-Server Decoupling**: Clients only send inputs; server handles simulation
- **Scalable Design**: Existing system handles multiple human players

### Key Insights

1. AI enemies can be implemented entirely server-side
2. Existing infrastructure supports AI with minimal changes
3. AI can use same TankState structure and simulation logic as human players
4. No client-side modifications required for core AI functionality

## 🚀 Implementation Strategy

### Core Principles

1. **Server-First**: All AI logic runs on server for authoritative state
2. **Reuse Existing Code**: Leverage current movement, vision, and combat systems
3. **Modular Design**: Behavior trees for maintainable AI logic
4. **Scalable**: Support multiple AI difficulty levels
5. **Compatible**: Seamless integration with multiplayer infrastructure

## 🧩 Component Implementation

### 1. AIEnemy Class

```typescript
// server/src/sim/ai-enemy.ts
export class AIEnemy {
  private readonly tank: TankState;
  private readonly behaviorTree: BehaviorTree;
  private readonly perception: PerceptionSystem;
  private readonly decisionEngine: DecisionEngine;
  private readonly lastActionTick: number;

  constructor(tankId: string, team: TeamColor, difficulty: AIChallengeLevel = "medium") {
    this.tank = makeTank({
      id: tankId,
      name: `AI-${difficulty}-${randomUUID().slice(0, 4)}`,
      team,
      rank: this.getRankByDifficulty(difficulty),
      currentTick: 0,
    });

    this.behaviorTree = new BehaviorTree(difficulty);
    this.perception = new PerceptionSystem();
    this.decisionEngine = new DecisionEngine(difficulty);
    this.lastActionTick = 0;
  }

  update(currentTick: number, worldState: WorldState): AIAction {
    const sensedWorld = this.perception.sense(this.tank, worldState);
    const action = this.decisionEngine.decide(this.tank, sensedWorld, currentTick);
    this.lastActionTick = currentTick;
    return action;
  }

  getTank(): TankState {
    return this.tank;
  }

  getDifficulty(): AIChallengeLevel {
    return this.behaviorTree.difficulty;
  }

  private getRankByDifficulty(level: AIChallengeLevel): MilitaryRank {
    const rankMap: Record<AIChallengeLevel, MilitaryRank> = {
      easy: MilitaryRank.RECRUIT,
      medium: MilitaryRank.SERGEANT,
      hard: MilitaryRank.COLONEL,
      expert: MilitaryRank.GENERAL,
    };
    return rankMap[level] || MilitaryRank.SERGEANT;
  }
}
```

### 2. Perception System

```typescript
// server/src/sim/ai-perception.ts
export class PerceptionSystem {
  sense(ai: TankState, world: WorldState): SensoryData {
    // Use existing vision system
    const visionSet = computeVisionSet(
      ai,
      {
        tanks: world.tanks,
        projectiles: world.projectiles,
        mines: world.mines,
        pickups: world.pickups,
        radarReveals: world.radarReveals,
      },
      world.currentTick,
    );

    // Extract relevant data
    const visibleTanks = Array.from(world.tanks).filter(
      (t) => visionSet.visibleTankIds.has(t.id) && t.id !== ai.id,
    );

    const visibleProjectiles = Array.from(world.projectiles).filter((p) =>
      visionSet.visibleProjectileIds.has(p.id),
    );

    const visibleMines = Array.from(world.mines).filter((m) => visionSet.visibleMineIds.has(m.id));

    const visiblePickups = Array.from(world.pickups).filter((p) =>
      visionSet.visiblePickupIds.has(p.id),
    );

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

  private calculateThreatLevel(
    ai: TankState,
    projectiles: ProjectileState[],
    enemies: TankState[],
  ): number {
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
}
```

### 3. Decision Engine

```typescript
// server/src/sim/ai-decision.ts
export class DecisionEngine {
  private readonly difficulty: AIChallengeLevel;

  constructor(difficulty: AIChallengeLevel) {
    this.difficulty = difficulty;
  }

  decide(ai: TankState, perception: SensoryData, currentTick: number): AIAction {
    const action: AIAction = {};

    if (this.difficulty === "easy") {
      this.decideEasy(ai, perception, action);
    } else if (this.difficulty === "medium") {
      this.decideMedium(ai, perception, action);
    } else if (this.difficulty === "hard") {
      this.decideHard(ai, perception, action);
    } else {
      this.decideExpert(ai, perception, action);
    }

    return action;
  }

  private decideEasy(ai: TankState, perception: SensoryData, action: AIAction): void {
    if (ai.fuel < 200 && perception.nearestPickup) {
      action.moveTarget = { x: perception.nearestPickup.x, y: perception.nearestPickup.y };
    } else if (perception.nearestEnemy) {
      action.moveTarget = { x: perception.nearestEnemy.x, y: perception.nearestEnemy.y };
    }

    if (perception.nearestEnemy && Math.random() > 0.7) {
      action.fire = {
        weapon: ProjectileKind.BULLET,
        aim: Math.atan2(perception.nearestEnemy.y - ai.y, perception.nearestEnemy.x - ai.x),
      };
    }

    if (ai.ammo.shields > 0 && Math.random() > 0.9) {
      action.useItem = ItemType.SHIELD;
    }
  }

  private decideMedium(ai: TankState, perception: SensoryData, action: AIAction): void {
    if (ai.fuel < 150 && perception.nearestPickup) {
      action.moveTarget = { x: perception.nearestPickup.x, y: perception.nearestPickup.y };
    } else if (perception.threatLevel > 70) {
      const safePosition = this.findSafePosition(ai, perception);
      if (safePosition) {
        action.moveTarget = safePosition;
      }

      if (ai.ammo.shields > 0 && !ai.hasShield) {
        action.useItem = ItemType.SHIELD;
      }
    } else if (perception.nearestEnemy) {
      action.moveTarget = { x: perception.nearestEnemy.x, y: perception.nearestEnemy.y };

      const distance = Math.hypot(
        perception.nearestEnemy.x - ai.x,
        perception.nearestEnemy.y - ai.y,
      );

      if (distance < 400) {
        action.fire = {
          weapon: ProjectileKind.BULLET,
          aim: Math.atan2(perception.nearestEnemy.y - ai.y, perception.nearestEnemy.x - ai.x),
        };
      }

      if (distance < 200 && ai.ammo.missiles > 0 && Math.random() > 0.3) {
        action.fire = {
          weapon: ProjectileKind.MISSILE,
          aim: Math.atan2(perception.nearestEnemy.y - ai.y, perception.nearestEnemy.x - ai.x),
        };
      }
    }

    if (ai.ammo.mines > 0 && Math.random() > 0.4) {
      action.placeMine = true;
    }
  }

  private decideHard(ai: TankState, perception: SensoryData, action: AIAction): void {
    if (perception.nearestEnemy) {
      const targetAngle = Math.atan2(
        perception.nearestEnemy.y - ai.y,
        perception.nearestEnemy.x - ai.x,
      );

      const distance = Math.hypot(
        perception.nearestEnemy.x - ai.x,
        perception.nearestEnemy.y - ai.y,
      );

      if (distance < 500) {
        action.fire = {
          weapon: ProjectileKind.BULLET,
          aim: targetAngle,
        };

        if (distance < 300 && ai.ammo.missiles > 0 && Math.random() > 0.2) {
          action.fire = {
            weapon: ProjectileKind.MISSILE,
            aim: targetAngle,
          };
        }
      }

      const optimalPosition = this.findOptimalPosition(ai, perception.nearestEnemy);
      if (optimalPosition) {
        action.moveTarget = optimalPosition;
      }
    }

    if (ai.fuel < 100 && perception.nearestPickup) {
      action.moveTarget = { x: perception.nearestPickup.x, y: perception.nearestPickup.y };
    }

    if (perception.threatLevel > 80) {
      if (ai.ammo.shields > 0 && !ai.hasShield) {
        action.useItem = ItemType.SHIELD;
      }

      if (ai.ammo.teleports > 0 && Math.random() > 0.5) {
        const safeSpot = this.findSafePosition(ai, perception);
        if (safeSpot) {
          action.teleport = safeSpot;
        }
      }
    }

    if (ai.ammo.mines > 0) {
      if (perception.nearestEnemy && Math.random() > 0.6) {
        action.placeMine = true;
      }
    }

    if (ai.ammo.radar > 0 && Math.random() > 0.3) {
      action.useItem = ItemType.RADAR;
    }
  }

  private decideExpert(ai: TankState, perception: SensoryData, action: AIAction): void {
    if (perception.nearestEnemy) {
      const predictedPosition = this.predictEnemyPosition(
        perception.nearestEnemy,
        perception.visibleProjectiles,
        2,
      );

      if (predictedPosition) {
        const targetAngle = Math.atan2(predictedPosition.y - ai.y, predictedPosition.x - ai.x);

        const distance = Math.hypot(predictedPosition.x - ai.x, predictedPosition.y - ai.y);

        if (distance < 500) {
          action.fire = {
            weapon: ProjectileKind.BULLET,
            aim: targetAngle,
          };

          if (distance < 300 && ai.ammo.missiles > 0 && Math.random() > 0.4) {
            action.fire = {
              weapon: ProjectileKind.MISSILE,
              aim: targetAngle,
            };
          }
        }

        const optimalPosition = this.findOptimalPosition(ai, perception.nearestEnemy);
        if (optimalPosition) {
          action.moveTarget = optimalPosition;
        }
      }
    }

    if (ai.fuel < 120 && perception.nearestPickup) {
      if (ai.ammo.radar > 0 && Math.random() > 0.5) {
        action.useItem = ItemType.RADAR;
      }
      action.moveTarget = { x: perception.nearestPickup.x, y: perception.nearestPickup.y };
    }

    if (perception.threatLevel > 85) {
      if (ai.ammo.shields > 0 && !ai.hasShield) {
        action.useItem = ItemType.SHIELD;
      }

      if (ai.ammo.teleports > 0 && Math.random() > 0.7) {
        const escapePosition = this.findEscapePosition(ai, perception);
        if (escapePosition) {
          action.teleport = escapePosition;
        }
      }
    }

    if (ai.ammo.mines > 0) {
      if (perception.nearestEnemy && Math.random() > 0.6) {
        action.placeMine = true;
      }
    }

    if (ai.ammo.radar > 0 && Math.random() > 0.2) {
      action.useItem = ItemType.RADAR;
    }

    if (perception.visibleTanks.length > 1 && Math.random() > 0.6) {
      const weakestEnemy = this.findWeakestEnemy(perception.visibleTanks);
      if (weakestEnemy) {
        const targetAngle = Math.atan2(weakestEnemy.y - ai.y, weakestEnemy.x - ai.x);

        action.fire = {
          weapon: ProjectileKind.BULLET,
          aim: targetAngle,
        };

        if (
          Math.hypot(weakestEnemy.x - ai.x, weakestEnemy.y - ai.y) < 300 &&
          ai.ammo.missiles > 0
        ) {
          action.fire = {
            weapon: ProjectileKind.MISSILE,
            aim: targetAngle,
          };
        }
      }
    }
  }
}
```

### 4. Behavior Tree System

```typescript
// server/src/sim/ai-behavior-tree.ts
export class BehaviorTree {
  public readonly difficulty: AIChallengeLevel;
  private readonly root: TreeNode;

  constructor(difficulty: AIChallengeLevel) {
    this.difficulty = difficulty;
    this.root = this.buildBehaviorTree();
  }

  private buildBehaviorTree(): TreeNode {
    switch (this.difficulty) {
      case "easy":
        return new SelectorNode([
          new SequenceNode([new IsLowFuelNode(), new MoveToPickupNode()]),
          new SequenceNode([new HasVisibleEnemyNode(), new MoveToEnemyNode()]),
          new SequenceNode([new IsLowAmmoNode(), new UseItemNode(ItemType.SHIELD)]),
          new RandomMoveNode(),
        ]);

      case "medium":
        return new SelectorNode([
          new SequenceNode([new IsLowFuelNode(), new MoveToPickupNode()]),
          new SequenceNode([
            new IsHighThreatNode(),
            new UseShieldNode(),
            new MoveToSafePositionNode(),
          ]),
          new SequenceNode([new HasVisibleEnemyNode(), new AttackNode(), new PlaceMineNode()]),
          new RandomMoveNode(),
        ]);

      case "hard":
        return new SelectorNode([
          new SequenceNode([new IsLowFuelNode(), new MoveToPickupNode()]),
          new SequenceNode([
            new IsHighThreatNode(),
            new UseShieldNode(),
            new UseTeleportNode(),
            new MoveToSafePositionNode(),
          ]),
          new SequenceNode([
            new HasVisibleEnemyNode(),
            new PredictiveAttackNode(),
            new FlankNode(),
            new PlaceMineNode(),
          ]),
          new SequenceNode([
            new HasLowAmmoNode(),
            new UseItemNode(ItemType.RADAR),
            new UseItemNode(ItemType.SHIELD),
          ]),
          new RandomMoveNode(),
        ]);

      case "expert":
        return new SelectorNode([
          new SequenceNode([new IsLowFuelNode(), new MoveToPickupNode()]),
          new SequenceNode([
            new IsHighThreatNode(),
            new UseShieldNode(),
            new UseTeleportNode(),
            new MoveToSafePositionNode(),
          ]),
          new SequenceNode([
            new HasVisibleEnemyNode(),
            new PredictiveAttackNode(),
            new FlankNode(),
            new PlaceMineNode(),
            new UseRadarNode(),
          ]),
          new SequenceNode([
            new HasLowAmmoNode(),
            new UseItemNode(ItemType.RADAR),
            new UseItemNode(ItemType.SHIELD),
          ]),
          new SequenceNode([
            new HasMultipleEnemiesNode(),
            new TargetWeakestNode(),
            new AmbushNode(),
          ]),
          new RandomMoveNode(),
        ]);
    }
  }

  evaluate(): AIAction {
    return this.root.evaluate();
  }
}
```

### 5. RoomLoop Integration

```typescript
// server/src/loop.ts - Modified section
export class RoomLoop {
  // ... existing code ...

  private aiEnemies: Map<string, AIEnemy> = new Map();
  private aiDifficulty: AIChallengeLevel = "medium";
  private aiSpawnInterval = 120;
  private lastAISpawnTick = 0;
  private aiCount = 0;

  // Add AI enemy to the game
  addAIEnemy(difficulty: AIChallengeLevel = this.aiDifficulty): AIEnemy {
    const aiId = `ai-${this.aiCount++}`;
    const team = pickTeam(this.teamCensus);
    const ai = new AIEnemy(aiId, team, difficulty);
    this.aiEnemies.set(aiId, ai);
    this.teamCensus.set(team, (this.teamCensus.get(team) ?? 0) + 1);

    // Add to tank map for simulation
    this.tanks.set(aiId, ai.getTank());

    return ai;
  }

  // Update AI enemies on each tick
  private updateAIEnemies(): void {
    const currentTick = this.tickIndex;

    // Spawn new AI enemies periodically
    if (currentTick - this.lastAISpawnTick >= this.aiSpawnInterval) {
      this.addAIEnemy();
      this.lastAISpawnTick = currentTick;
    }

    // Update all AI enemies
    for (const [aiId, ai] of this.aiEnemies) {
      const worldState: WorldState = {
        tanks: Array.from(this.tanks.values()),
        projectiles: Array.from(this.projectiles.values()),
        mines: Array.from(this.mines.values()),
        pickups: Array.from(this.pickups.values()),
        radarReveals: this.radarReveals,
        currentTick,
      };

      const action = ai.update(currentTick, worldState);

      // Process AI action
      if (action.moveTarget) {
        this.commands.set(aiId, {
          kind: "MOVE_TO",
          x: action.moveTarget.x,
          y: action.moveTarget.y,
          clientTick: currentTick,
        });
      }

      if (action.fire) {
        const fireMsg: ClientFireMessage = {
          type: ClientMessageType.FIRE,
          weapon: action.fire.weapon,
          aim: action.fire.aim,
        };
        this.handleFire(aiId, fireMsg);
      }

      if (action.useItem) {
        const useItemMsg: ClientUseItemMessage = {
          type: ClientMessageType.USE_ITEM,
          item: action.useItem,
        };
        this.handleUseItem(aiId, useItemMsg);
      }

      if (action.placeMine) {
        const placeMineMsg: ClientPlaceMineMessage = {
          type: ClientMessageType.PLACE_MINE,
        };
        this.handlePlaceMine(aiId, placeMineMsg);
      }

      if (action.teleport) {
        const teleportMsg: ClientTeleportMessage = {
          type: ClientMessageType.TELEPORT,
          x: action.teleport.x,
          y: action.teleport.y,
        };
        this.handleTeleport(aiId, teleportMsg);
      }
    }
  }

  // Modified tick() method
  private tick(): void {
    this.tickIndex += 1;
    const t = this.tickIndex;
    const dt = TICK_MS / 1000;

    // 0. Update AI enemies
    this.updateAIEnemies();

    // 1. Movement + per-tick costs (shield drain).
    for (const [connId, input] of this.inputs) {
      // ... existing code ...
    }

    // ... rest of tick method ...
  }
}
```

## 📊 Implementation Timeline

| Phase                    | Tasks                                                             | Duration | Deliverables                   |
| ------------------------ | ----------------------------------------------------------------- | -------- | ------------------------------ |
| **1. Core AI**           | Implement AIEnemy, PerceptionSystem, DecisionEngine, BehaviorTree | 2 days   | Complete AI logic modules      |
| **2. Integration**       | Modify RoomLoop to support AI enemies                             | 2 days   | Server-side AI integration     |
| **3. Testing**           | Test AI behavior across difficulty levels                         | 2 days   | Balanced AI performance        |
| **4. Client Adaptation** | Update client for single-player mode                              | 1 day    | Single-player mode support     |
| **5. Documentation**     | Update README with AI features                                    | 1 day    | Comprehensive AI documentation |

## 🚨 Risks & Mitigations

| Risk                        | Mitigation                         | Solution                                                         |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| **Performance Impact**      | Profile AI performance             | Limit AI updates to every other tick for lower difficulty levels |
| **AI Behavior Complexity**  | Use behavior tree pattern          | Start with medium difficulty and progressively add complexity    |
| **AI-Player Conflict**      | Ensure AI uses same game mechanics | Test AI against human players in multiplayer mode                |
| **Network Synchronization** | Keep AI simulation server-side     | AI actions sent through same protocol as human players           |

## ✅ Success Criteria

1. **Functional**: AI enemies spawn, move, attack, and use items appropriately
2. **Balanced**: AI difficulty scales appropriately from easy to expert
3. **Performance**: AI adds <10% CPU overhead to server
4. **Compatible**: Works seamlessly with existing multiplayer infrastructure
5. **User Experience**: Single-player mode feels engaging and challenging

## 💡 Future Extensions

1. **Dynamic AI**: AI learns from player behavior over time
2. **AI Teamwork**: Multiple AI enemies coordinate attacks
3. **AI Personality**: Different AI types with unique behaviors
4. **AI Progression**: AI gains experience and improves over time
5. **AI Customization**: Players can customize AI behavior

## 📌 Implementation Checklist

- [ ] Create AIEnemy class
- [ ] Implement PerceptionSystem
- [ ] Implement DecisionEngine
- [ ] Create BehaviorTree system
- [ ] Modify RoomLoop to support AI enemies
- [ ] Implement AI spawning and management
- [ ] Connect AI actions to game simulation
- [ ] Update client for single-player mode
- [ ] Test AI behavior across difficulty levels
- [ ] Balance AI performance
- [ ] Optimize AI performance for multiplayer compatibility
- [ ] Update README with AI features
- [ ] Document AI difficulty levels
- [ ] Create AI behavior reference

## 📎 Appendix: Configuration

### AI Difficulty Levels

| Level  | Behavior                     | Challenge | AI Rank  |
| ------ | ---------------------------- | --------- | -------- |
| Easy   | Survival-focused             | Low       | Recruit  |
| Medium | Balanced offense/defense     | Moderate  | Sergeant |
| Hard   | Aggressive tactics           | High      | Colonel  |
| Expert | Predictive, advanced tactics | Very High | General  |

### AI Spawn Parameters

- Initial spawn: 3 AI enemies
- Spawn interval: 120 ticks (~6 seconds)
- Maximum AI count: 10
- Difficulty progression: Increases as player rank improves

This execution plan provides a comprehensive, scalable solution for adding AI enemies to Tank-you-again. The approach leverages the existing server architecture to minimize changes while maximizing functionality. All AI behavior runs on the server, ensuring authoritative game state and compatibility with the existing multiplayer infrastructure.

I'm ready to implement this plan. Would you like me to proceed with the implementation of the AI system?
