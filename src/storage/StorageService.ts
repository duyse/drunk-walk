/** localStorage wrapper that never throws; falls back to memory (private mode, quota, disabled). */
export class StorageService {
  private mem = new Map<string, string>();
  private ok: boolean;

  constructor(private prefix = 'drunkwalk:') {
    this.ok = (() => {
      try {
        const k = prefix + '__t';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        return true;
      } catch {
        return false;
      }
    })();
  }

  get available(): boolean {
    return this.ok;
  }

  get<T>(key: string, fallback: T): T {
    const raw = this.ok ? safe(() => localStorage.getItem(this.prefix + key)) : this.mem.get(key) ?? null;
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    const raw = JSON.stringify(value);
    this.mem.set(key, raw);
    if (this.ok) safe(() => localStorage.setItem(this.prefix + key, raw));
  }

  remove(key: string): void {
    this.mem.delete(key);
    if (this.ok) safe(() => localStorage.removeItem(this.prefix + key));
  }
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
