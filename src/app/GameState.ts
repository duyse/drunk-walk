export enum GameState {
  BOOT = 'BOOT',
  MENU = 'MENU',
  CALIBRATING = 'CALIBRATING',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  FALLING = 'FALLING',
  GAME_OVER = 'GAME_OVER',
  LEADERBOARD = 'LEADERBOARD',
  SETTINGS = 'SETTINGS',
}

const ALLOWED: Record<GameState, GameState[]> = {
  [GameState.BOOT]: [GameState.MENU],
  [GameState.MENU]: [GameState.CALIBRATING, GameState.PLAYING, GameState.LEADERBOARD, GameState.SETTINGS],
  [GameState.CALIBRATING]: [GameState.PLAYING, GameState.MENU],
  [GameState.PLAYING]: [GameState.PAUSED, GameState.FALLING],
  [GameState.PAUSED]: [GameState.PLAYING, GameState.MENU],
  [GameState.FALLING]: [GameState.GAME_OVER],
  [GameState.GAME_OVER]: [GameState.PLAYING, GameState.CALIBRATING, GameState.LEADERBOARD, GameState.MENU],
  [GameState.LEADERBOARD]: [GameState.MENU, GameState.GAME_OVER],
  [GameState.SETTINGS]: [GameState.MENU],
};

export class StateMachine {
  current = GameState.BOOT;
  previous = GameState.BOOT;
  onChange: ((to: GameState, from: GameState) => void) | null = null;

  transition(to: GameState): boolean {
    if (to === this.current) return true;
    if (!ALLOWED[this.current].includes(to)) {
      console.warn(`[state] illegal ${this.current} -> ${to}`);
      return false;
    }
    this.previous = this.current;
    this.current = to;
    this.onChange?.(to, this.previous);
    return true;
  }

  is(...states: GameState[]): boolean {
    return states.includes(this.current);
  }
}
