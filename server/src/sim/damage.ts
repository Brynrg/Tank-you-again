import { TankState, ProjectileState, TeamColor, TANK_RADIUS } from "@shared/types";

export function calculateArmorPenetration(
  projectile: ProjectileState,
  tank: TankState,
): { damage: number; armorPenetration: number; hitSide: 'front' | 'side' | 'rear' } {
  // Calculate angle relative to tank's forward direction
  const dx = projectile.x - tank.x;
  const dy = projectile.y - tank.y;
  const angleToTank = Math.atan2(dy, dx);
  const relativeAngle = (angleToTank - tank.angle + Math.PI * 2) % (Math.PI * 2);
  
  // Determine which armor face was hit (front, side, rear)
  let hitSide: 'front' | 'side' | 'rear' = 'front';
  
  if (relativeAngle > Math.PI * 0.75 && relativeAngle < Math.PI * 1.25) {
    hitSide = 'side';
  } else if (relativeAngle > Math.PI * 1.25 || relativeAngle < Math.PI * 0.75) {
    hitSide = 'rear';
  }
  
  // Calculate damage multiplier based on armor facing
  let armorValue: number;
  let damageMultiplier: number;
  
  switch(hitSide) {
    case 'front':
      armorValue = tank.armor.front;
      damageMultiplier = 1.0;
      break;
    case 'side':
      armorValue = tank.armor.side;
      damageMultiplier = 0.8;
      break;
    case 'rear':
      armorValue = tank.armor.rear;
      damageMultiplier = 0.6;
      break;
  }
  
  const effectiveDamage = projectile.damage * damageMultiplier;
  const armorPenetration = Math.min(effectiveDamage, armorValue);
  
  return { damage: effectiveDamage, armorPenetration, hitSide };
}

export function applyDamage(
  tank: TankState,
  projectile: ProjectileState,
): TankState {
  const { damage, armorPenetration, hitSide } = calculateArmorPenetration(projectile, tank);

  // Apply damage to hull
  const newFuel = Math.max(0, tank.fuel - damage);

  // Create new tank state with updated fuel
  const newTank: TankState = {
    ...tank,
    fuel: newFuel,
  };

  // If shield is active, reduce damage by 50%
  if (tank.hasShield) {
    newTank.fuel += damage * 0.5; // Recharge shield
  }

  // Apply armor degradation
  if (armorPenetration > 0) {
    const armorDegradation = armorPenetration / 100; // Convert to 0-1 scale
    const newArmor = { ...tank.armor };
    
    switch(hitSide) {
      case 'front':
        newArmor.front = Math.max(0, tank.armor.front - armorDegradation * 10);
        break;
      case 'side':
        newArmor.side = Math.max(0, tank.armor.side - armorDegradation * 8);
        break;
      case 'rear':
        newArmor.rear = Math.max(0, tank.armor.rear - armorDegradation * 6);
        break;
    }
    
    newTank.armor = newArmor;
  }

  return newTank;
}