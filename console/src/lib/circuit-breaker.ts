// Three-state circuit breaker (closed → open → half-open) with a sliding
// failure ratio. Half-open is single-flight: only one probe request
// proceeds while open, the rest fast-fail. Matches the pattern published
// in Nygard's "Release It!" and used in Netflix Hystrix / resilience4j.

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  failureThreshold: number;     // 0..1, open when ratio over window exceeds this
  minRequests: number;          // require at least this many samples
  windowMs: number;             // sliding window for failure ratio
  openMs: number;               // how long to stay open before half-open
  halfOpenMaxConcurrency: number;
  now?: () => number;
}

const DEFAULT: BreakerOptions = {
  failureThreshold: 0.5,
  minRequests: 20,
  windowMs: 30_000,
  openMs: 30_000,
  halfOpenMaxConcurrency: 1,
};

interface Sample { ts: number; ok: boolean }

export class CircuitOpenError extends Error {
  constructor(public readonly name_: string) {
    super(`circuit open: ${name_}`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private samples: Sample[] = [];
  private openedAt = 0;
  private halfOpenInFlight = 0;
  private readonly opts: BreakerOptions;
  private readonly now: () => number;

  constructor(public readonly name: string, opts: Partial<BreakerOptions> = {}) {
    this.opts = { ...DEFAULT, ...opts };
    this.now = this.opts.now ?? Date.now;
  }

  getState(): BreakerState { return this.state; }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.transition();
    if (this.state === "open") throw new CircuitOpenError(this.name);
    if (this.state === "half-open") {
      if (this.halfOpenInFlight >= this.opts.halfOpenMaxConcurrency) {
        throw new CircuitOpenError(this.name);
      }
      this.halfOpenInFlight++;
    }
    const t0 = this.now();
    try {
      const out = await fn();
      this.record(true);
      if (this.state === "half-open") {
        this.state = "closed";
        this.samples = [];
      }
      return out;
    } catch (e) {
      this.record(false);
      this.maybeOpen();
      throw e;
    } finally {
      if (this.state === "half-open") this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      void t0;
    }
  }

  private record(ok: boolean): void {
    this.samples.push({ ts: this.now(), ok });
    const horizon = this.now() - this.opts.windowMs;
    while (this.samples.length && this.samples[0].ts < horizon) this.samples.shift();
  }

  private maybeOpen(): void {
    if (this.state !== "closed") return;
    if (this.samples.length < this.opts.minRequests) return;
    const failures = this.samples.reduce((n, s) => n + (s.ok ? 0 : 1), 0);
    const ratio = failures / this.samples.length;
    if (ratio >= this.opts.failureThreshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }

  private transition(): void {
    if (this.state === "open" && this.now() - this.openedAt >= this.opts.openMs) {
      this.state = "half-open";
    }
  }
}

// Exponential backoff with full jitter (AWS Architecture Blog pattern).
// cap to avoid unbounded waits, base for the first retry.
export function backoff(attempt: number, baseMs = 100, capMs = 30_000): number {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * exp);
}
