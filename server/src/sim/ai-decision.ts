import { ProjectileKind } from "@shared/types";
import type { TankState } from "@shared/types";
import type { SensoryData, AIAction } from "./ai-enemy.js";

export type AIChallengeLevel = 'easy' | 'medium' | 'hard' | 'expert';

export class DecisionEngine {
  private readonly difficulty: AIChallengeLevel;
  
  constructor(difficulty: AIChallengeLevel) {
    this.difficulty = difficulty;
  }
  
  decide(ai: TankState, perception: SensoryData): AIAction {
    const action: AIAction = {};
    
    if (this.difficulty === 'easy') {
      this.decideEasy(ai, perception, action);
    } else if (this.difficulty === 'medium') {
      this.decideMedium(ai, perception, action);
    } else if (this.difficulty === 'hard') {
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
        weapon: 'BULLET',
        aim: Math.atan2(
          perception.nearestEnemy.y - ai.y,
          perception.nearestEnemy.x - ai.x
        )
      };
    }
    
    if (ai.ammo && ai.ammo.shields > 0 && Math.random() > 0.9) {
      action.useItem = 'SHIELD';
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
      
      if (ai.ammo && ai.ammo.shields > 0 && !ai.hasShield) {
        action.useItem = 'SHIELD';
      }
    } else if (perception.nearestEnemy) {
      action.moveTarget = { x: perception.nearestEnemy.x, y: perception.nearestEnemy.y };
      
      const distance = Math.hypot(
        perception.nearestEnemy.x - ai.x,
        perception.nearestEnemy.y - ai.y
      );
      
      if (distance < 400) {
        action.fire = {
          weapon: 'BULLET',
          aim: Math.atan2(
            perception.nearestEnemy.y - ai.y,
            perception.nearestEnemy.x - ai.x
          )
        };
      }
      
      if (distance < 200 && ai.ammo && ai.ammo.missiles > 0 && Math.random() > 0.3) {
        action.fire = {
          weapon: 'MISSILE',
          aim: Math.atan2(
            perception.nearestEnemy.y - ai.y,
            perception.nearestEnemy.x - ai.x
          )
        };
      }
    }
    
    if (ai.ammo && ai.ammo.mines > 0 && Math.random() > 0.4) {
      action.placeMine = true;
    }
  }
  
  private decideHard(ai: TankState, perception: SensoryData, action: AIAction): void {
    if (perception.nearestEnemy) {
      const targetAngle = Math.atan2(
        perception.nearestEnemy.y - ai.y,
        perception.nearestEnemy.x - ai.x
      );
      
      const distance = Math.hypot(
        perception.nearestEnemy.x - ai.x,
        perception.nearestEnemy.y - ai.y
      );
      
      if (distance < 500) {
        action.fire = {
          weapon: 'BULLET',
          aim: targetAngle
        };
        
        if (distance < 300 && ai.ammo && ai.ammo.missiles > 0 && Math.random() > 0.2) {
          action.fire = {
            weapon: 'MISSILE',
            aim: targetAngle
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
      if (ai.ammo && ai.ammo.shields > 0 && !ai.hasShield) {
        action.useItem = 'SHIELD';
      }
      
      if (ai.ammo && ai.ammo.teleports > 0 && Math.random() > 0.5) {
        const safeSpot = this.findSafePosition(ai, perception);
        if (safeSpot) {
          action.teleport = safeSpot;
        }
      }
    }
    
    if (ai.ammo && ai.ammo.mines > 0) {
      if (perception.nearestEnemy && Math.random() > 0.6) {
        action.placeMine = true;
      }
    }
    
    if (ai.ammo && ai.ammo.radar > 0 && Math.random() > 0.3) {
      action.useItem = 'RADAR';
    }
  }
  
  private decideExpert(ai: TankState, perception: SensoryData, action: AIAction): void {
    if (perception.nearestEnemy) {
      const predictedPosition = this.predictEnemyPosition(
        perception.nearestEnemy,
        2
      );
      
      if (predictedPosition) {
        const targetAngle = Math.atan2(
          predictedPosition.y - ai.y,
          predictedPosition.x - ai.x
        );
        
        const distance = Math.hypot(
          predictedPosition.x - ai.x,
          predictedPosition.y - ai.y
        );
        
        if (distance < 500) {
          action.fire = {
            weapon: 'BULLET',
            aim: targetAngle
          };
          
          if (distance < 300 && ai.ammo && ai.ammo.missiles > 0 && Math.random() > 0.4) {
            action.fire = {
              weapon: 'MISSILE',
              aim: targetAngle
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
      if (ai.ammo && ai.ammo.radar > 0 && Math.random() > 0.5) {
        action.useItem = 'RADAR';
      }
      action.moveTarget = { x: perception.nearestPickup.x, y: perception.nearestPickup.y };
    }
    
    if (perception.threatLevel > 85) {
      if (ai.ammo && ai.ammo.shields > 0 && !ai.hasShield) {
        action.useItem = 'SHIELD';
      }
      
      if (ai.ammo && ai.ammo.teleports > 0 && Math.random() > 0.7) {
        const escapePosition = this.findEscapePosition(ai, perception);
        if (escapePosition) {
          action.teleport = escapePosition;
        }
      }
    }
    
    if (ai.ammo && ai.ammo.mines > 0) {
      if (perception.nearestEnemy && Math.random() > 0.6) {
        action.placeMine = true;
      }
    }
    
    if (ai.ammo && ai.ammo.radar > 0 && Math.random() > 0.2) {
      action.useItem = 'RADAR';
    }
    
    if (perception.visibleTanks.length > 1 && Math.random() > 0.6) {
      const weakestEnemy = this.findWeakestEnemy(perception.visibleTanks);
      if (weakestEnemy) {
        const targetAngle = Math.atan2(
          weakestEnemy.y - ai.y,
          weakestEnemy.x - ai.x
        );
        
        action.fire = {
          weapon: 'BULLET',
          aim: targetAngle
        };
        
        if (Math.hypot(weakestEnemy.x - ai.x, weakestEnemy.y - ai.y) < 300 && ai.ammo && ai.ammo.missiles > 0) {
          action.fire = {
            weapon: 'MISSILE',
            aim: targetAngle
          };
        }
      }
    }
  }
  
  private findSafePosition(ai: TankState, perception: SensoryData): { x: number; y: number } | null {
    // Move to a position away from nearest enemy
    if (perception.nearestEnemy) {
      const dx = ai.x - perception.nearestEnemy.x;
      const dy = ai.y - perception.nearestEnemy.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        return { 
          x: ai.x + (dx / distance) * 150, 
          y: ai.y + (dy / distance) * 150 
        };
      }
    }
    return null;
  }
  
  private findOptimalPosition(ai: TankState, enemy: TankState): { x: number; y: number } | null {
    // Move to a flanking position relative to enemy
    const dx = enemy.x - ai.x;
    const dy = enemy.y - ai.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0) {
      // Perpendicular offset for flanking
      const offsetX = -dy / distance * 100;
      const offsetY = dx / distance * 100;
      return { 
        x: enemy.x + offsetX, 
        y: enemy.y + offsetY 
      };
    }
    return { x: enemy.x + 100, y: enemy.y + 100 };
  }
  
  private predictEnemyPosition(enemy: TankState, steps: number): { x: number; y: number } | null {
    // Simple prediction: move in the same direction
    return { x: enemy.x + steps * 20, y: enemy.y + steps * 20 };
  }
  
  private findEscapePosition(ai: TankState, perception: SensoryData): { x: number; y: number } | null {
    // Move to opposite side of nearest enemy
    if (perception.nearestEnemy) {
      const dx = ai.x - perception.nearestEnemy.x;
      const dy = ai.y - perception.nearestEnemy.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        return { 
          x: ai.x + (dx / distance) * 200, 
          y: ai.y + (dy / distance) * 200 
        };
      }
    }
    return null;
  }
  
  private findWeakestEnemy(enemies: TankState[]): TankState | null {
    if (enemies.length === 0) return null;
    
    let weakest = enemies[0]!;
    let minHealth = weakest.fuel; // Using fuel as health proxy
    
    for (const enemy of enemies) {
      if (enemy.fuel < minHealth) {
        minHealth = enemy.fuel;
        weakest = enemy;
      }
    }
    
    return weakest;
  }
}