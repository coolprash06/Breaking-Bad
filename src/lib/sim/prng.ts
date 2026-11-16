/**
 * Seeded pseudo-random numbers so the simulated data is identical on every run.
 * Each source/district gets its own stream (seed mixed with a key), so adding a
 * source never changes the data of the others.
 */

/** 32-bit FNV-1a hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private state: number;
  private spareNormal: number | null = null;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  /** Uniform in [0, 1). Small xorshift-multiply generator. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  uniform(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b] inclusive. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  bernoulli(p: number): boolean {
    return this.next() < p;
  }

  /** Normal via the polar Box-Muller method. */
  normal(mean = 0, sd = 1): number {
    if (this.spareNormal !== null) {
      const v = this.spareNormal;
      this.spareNormal = null;
      return mean + sd * v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    this.spareNormal = v * f;
    return mean + sd * u * f;
  }

  exponential(mean: number): number {
    return -mean * Math.log(1 - this.next());
  }

  /** Multiplicative noise with mean 1 (log-normal). */
  lognormalFactor(sd: number): number {
    return Math.exp(this.normal(0, sd) - (sd * sd) / 2);
  }
}

export function rngFor(seed: number, key: string): Rng {
  return new Rng((seed ^ hashString(key)) >>> 0);
}
