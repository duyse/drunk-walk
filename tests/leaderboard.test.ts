import { beforeEach, describe, expect, it } from 'vitest';
import { LocalLeaderboardService } from '../src/leaderboard/LocalLeaderboardService';
import { sanitizeName, isPlausibleEntry } from '../src/leaderboard/LeaderboardService';
import { StorageService } from '../src/storage/StorageService';

// Minimal localStorage polyfill for node.
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  };
});

const entry = (name: string, distance: number) => ({
  name,
  distance,
  score: distance * 10,
  runTime: distance / 2.5,
  timestamp: Date.now(),
});

describe('sanitizeName', () => {
  it('trims and enforces 3–16 chars', () => {
    expect(sanitizeName('  Bob  ')).toBe('Bob');
    expect(sanitizeName('ab')).toBeNull();
    expect(sanitizeName('a'.repeat(17))).toBeNull();
  });
  it('strips HTML/injection characters', () => {
    expect(sanitizeName('<script>x</script>')).toBe('scriptxscript');
    expect(sanitizeName('<b>')).toBeNull();
  });
});

describe('isPlausibleEntry', () => {
  it('rejects impossible values', () => {
    expect(isPlausibleEntry({ ...entry('Bob', 100), score: 99999 }, 10, 3.6)).toBe(false);
    expect(isPlausibleEntry({ ...entry('Bob', 100), runTime: 1 }, 10, 3.6)).toBe(false);
    expect(isPlausibleEntry({ ...entry('Bob', 100), distance: NaN }, 10, 3.6)).toBe(false);
    expect(isPlausibleEntry(entry('Bob', 100), 10, 3.6)).toBe(true);
  });
});

describe('LocalLeaderboardService', () => {
  it('sorts by score desc and computes rank', async () => {
    const lb = new LocalLeaderboardService(new StorageService('t:'));
    await lb.submitScore(entry('Zed', 4000));
    const top = await lb.getTopScores(3);
    expect(top[0].name).toBe('Zed');
    expect(top.every((e, i) => i === 0 || top[i - 1].score >= e.score)).toBe(true);
    expect(await lb.getPlayerRank(40000)).toBe(1);
    expect(await lb.getPlayerRank(0)).toBe((await lb.getTopScores(100)).length + 1);
  });

  it('rejects malformed entries', async () => {
    const lb = new LocalLeaderboardService(new StorageService('t:'));
    await expect(lb.submitScore(entry('x', 10))).rejects.toThrow();
    await expect(lb.submitScore({ ...entry('Bob', 10), score: -5 })).rejects.toThrow();
  });

  it('persists to storage across instances', async () => {
    const st = new StorageService('t:');
    await new LocalLeaderboardService(st).submitScore(entry('Persist', 9000));
    const again = new LocalLeaderboardService(new StorageService('t:'));
    expect((await again.getTopScores(1))[0].name).toBe('Persist');
  });
});
