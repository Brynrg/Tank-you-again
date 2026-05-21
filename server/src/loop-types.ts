// Tiny module used by sim/* and loop.ts. Lives in its own file so sim modules
// can depend on it without pulling in the full loop (which depends on them).

export interface PlayerInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Aim angle in radians, world-space. */
  aim: number;
  /** Tick the client claimed when sending this input. */
  clientTick: number;
}

export const EMPTY_INPUT: PlayerInputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  aim: 0,
  clientTick: 0,
};
