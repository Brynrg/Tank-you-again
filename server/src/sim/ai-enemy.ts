import { MilitaryRank, TeamColor, type TankState } from "@shared/types";
import { makeTank } from "./world.js";

export type AIChallengeLevel = 'easy' | 'medium' | 'hard' | 'expert';

export interface AIAction {
  moveTarget?: { x: number; y: number };
  fire?: { weapon: 'BULLET' | 'MISSILE'; aim: number };
  useItem?: 'FUEL_CRATE' | 'SHIELD' | 'RADAR' | 'MISSILE' | 'MINE_PACK' | 'TELEPORT_CHARGE';
  placeMine?: boolean;
  teleport?: { x: number; y: number };
}

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

export class AIEnemy {
  private readonly tank: TankState;
  private readonly difficulty: AIChallengeLevel;
  private behaviorTree: any;
  private perception: any;
  private decisionEngine: any;
  private lastActionTick: number;
  
  constructor(tankId: string, team: TeamColor, difficulty: AIChallengeLevel = 'medium') {
    this.tank = makeTank({
      id: tankId,
      name: `AI-${difficulty}-${Math.random().toString(36).substr(2, 4)}`,
      team,
      rank: this.getRankByDifficulty(difficulty),
      currentTick: 0,
    });
    
    this.difficulty = difficulty;
    this.lastActionTick = 0;
    
    // Initialize AI modules with error handling
    try {
      this.perception = new PerceptionSystem();
      this.decisionEngine = new DecisionEngine(difficulty);
      this.behaviorTree = new BehaviorTree(difficulty);
    } catch {
      // Handle missing dependencies gracefully
      this.perception = null;
      this.decisionEngine = null;
      this.behaviorTree = null;
    }
  }
  
  update(currentTick: number, worldState: any): AIAction {
    // Use existing perception, decision, and behavior modules with null checks
    let sensedWorld: any;
    if (this.perception) {
      sensedWorld = this.perception.sense(this.tank, worldState);
    }
    
    let action: AIAction = {};
    if (this.decisionEngine && sensedWorld) {
      action = this.decisionEngine.decide(this.tank, sensedWorld);
    }
    
    this.lastActionTick = currentTick;
    return action;
  }
  
  getTank(): TankState {
    return this.tank;
  }
  
  getDifficulty(): AIChallengeLevel {
    return this.difficulty;
  }
  
  private getRankByDifficulty(level: AIChallengeLevel): MilitaryRank {
    const rankMap: Record<AIChallengeLevel, MilitaryRank> = {
      'easy': MilitaryRank.RECRUIT,
      'medium': MilitaryRank.SERGEANT,
      'hard': MilitaryRank.COLONEL,
      'expert': MilitaryRank.GENERAL
    };
    return rankMap[level] || MilitaryRank.SERGEANT;
  }
}