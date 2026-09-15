import { GAME_CONFIG } from '../app/GameConfig';
import type { StorageService } from '../storage/StorageService';
import { isPlausibleEntry, type LeaderboardService, type ScoreEntry } from './LeaderboardService';

const KEY = 'leaderboard';
const MAX_ENTRIES = 50;

const DEMO: ScoreEntry[] = [
  ['Oskar', 3120],
  ['Nilufar', 2610],
  ['Beni', 2205],
  ['Yuki', 1740],
  ['Marta', 1305],
  ['Dmitri', 980],
  ['Aoife', 610],
  ['Tomasz', 340],
].map(([name, d], i) => ({
  name: name as string,
  distance: d as number,
  score: (d as number) * GAME_CONFIG.scoring.scorePerMeter,
  runTime: (d as number) / 2.6,
  timestamp: 1_700_000_000_000 + i * 86_400_000,
}));

export class LocalLeaderboardService implements LeaderboardService {
  private entries: ScoreEntry[];

  constructor(private storage: StorageService) {
    const stored = storage.get<ScoreEntry[] | null>(KEY, null);
    this.entries = Array.isArray(stored) ? stored.filter((e) => this.valid(e)) : DEMO.slice();
    this.sort();
  }

  private valid(e: ScoreEntry): boolean {
    return isPlausibleEntry(e, GAME_CONFIG.scoring.scorePerMeter, GAME_CONFIG.walking.maxSpeed);
  }

  private sort(): void {
    this.entries.sort((a, b) => b.score - a.score || a.timestamp - b.timestamp);
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
  }

  async getTopScores(limit = 10): Promise<ScoreEntry[]> {
    return this.entries.slice(0, limit).map((e) => ({ ...e }));
  }

  async submitScore(entry: ScoreEntry): Promise<void> {
    if (!this.valid(entry)) throw new Error('Invalid score entry');
    this.entries.push({ ...entry });
    this.sort();
    this.storage.set(KEY, this.entries);
  }

  async getPlayerRank(score: number): Promise<number | null> {
    if (!Number.isFinite(score)) return null;
    let rank = 1;
    for (const e of this.entries) if (e.score > score) rank++;
    return rank;
  }
}
