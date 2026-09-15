export interface ScoreEntry {
  name: string;
  score: number;
  distance: number; // meters
  /** Run duration in seconds. Lets a future server sanity-check speed. */
  runTime: number;
  timestamp: number; // ms epoch
  /** True for the entry belonging to the local player (UI highlight). */
  isPlayer?: boolean;
}

/**
 * Backend-agnostic leaderboard contract. Swap LocalLeaderboardService for a
 * Supabase/Firebase/REST implementation without touching game code.
 */
export interface LeaderboardService {
  getTopScores(limit?: number): Promise<ScoreEntry[]>;
  submitScore(entry: ScoreEntry): Promise<void>;
  getPlayerRank(score: number): Promise<number | null>;
}

export const NAME_MIN = 3;
export const NAME_MAX = 16;

/** Trim, strip anything but letters/digits/space/_/-, enforce length. Returns null if invalid. */
export function sanitizeName(raw: string): string | null {
  const s = raw.trim().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim();
  if (s.length < NAME_MIN || s.length > NAME_MAX) return null;
  return s;
}

/** Plausibility check a server could also run. Rejects NaN, negatives, impossible speed. */
export function isPlausibleEntry(e: ScoreEntry, scorePerMeter: number, maxSpeed: number): boolean {
  if (!sanitizeName(e.name)) return false;
  if (![e.score, e.distance, e.runTime].every((n) => Number.isFinite(n) && n >= 0)) return false;
  if (e.score > Math.floor(e.distance * scorePerMeter) + 1) return false;
  if (e.distance > e.runTime * maxSpeed * 1.25 + 5) return false;
  return true;
}
