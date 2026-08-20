/**
 * Deterministic pseudo-randomness. The whole dataset must be reproducible from a fixed seed so the
 * README screenshots, the screen recording and anyone re-running the script all see the same graph.
 * Nothing here may use Math.random().
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** mulberry32 — small, fast, and good enough for fixture data. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error('Rng.pick called with an empty array');
    return item;
  }

  /** Picks by weight; heavier entries appear more often. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    const last = entries[entries.length - 1];
    if (!last) throw new Error('Rng.weighted called with no entries');
    return last[0];
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  shuffled<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const a = copy[i];
      const b = copy[j];
      if (a !== undefined && b !== undefined) {
        copy[i] = b;
        copy[j] = a;
      }
    }
    return copy;
  }

  /** ISO date between two years, inclusive. Dates must respect causality — see generate.ts. */
  date(minYear: number, maxYear: number): string {
    const year = this.int(minYear, maxYear);
    const month = this.int(1, 12);
    const day = this.int(1, 28);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}
