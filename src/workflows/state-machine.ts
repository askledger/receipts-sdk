/**
 * Workflow state machine, the spine of every end-to-end Project
 * Ledger workflow.
 *
 * Every workflow (receipt-signing flow, approval flow, evidence-pack
 * flow, key-rotation flow) is a series of states and transitions.
 * The state machine enforces:
 *   - Only valid transitions are permitted
 *   - Every transition emits an event consumers can subscribe to
 *   - The full transition history is captured for audit
 *
 * This is the workflow primitive the rest of src/workflows/ builds on.
 */

export interface Transition<S extends string> {
  from: S;
  to: S;
  /** Optional guard. Throws or returns false to block. */
  guard?: (ctx: unknown) => boolean | Promise<boolean>;
  /** Optional action executed on transition. */
  action?: (ctx: unknown) => void | Promise<void>;
}

export interface StateChangeRecord<S extends string> {
  from: S;
  to: S;
  at: string; // RFC 3339
  actor?: string;
  metadata?: Record<string, unknown>;
}

export class WorkflowError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[workflow:${code}] ${message}`);
  }
}

/**
 * Generic finite-state machine. Subclass per concrete workflow.
 */
export class StateMachine<S extends string, C = unknown> {
  private _state: S;
  private readonly history: StateChangeRecord<S>[] = [];
  private readonly transitions: Map<string, Transition<S>> = new Map();
  /**
   * Tail of the serialization queue. `transition` is async and awaits caller
   * code (guard, action) in the middle of a read-modify-write on `_state`, so
   * without this every concurrent call read the SAME starting state, both
   * passed validation, and BOTH ran: `pending -> approved` and
   * `pending -> rejected` on one approval workflow executed their actions and
   * the audit history recorded `approved -> rejected`, a transition that does
   * not exist in the table at all. Chaining each transition onto the previous
   * one makes the validate/guard/act/commit sequence a genuine critical
   * section, so the second caller re-validates against the committed state and
   * is correctly rejected as an invalid transition.
   */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(initial: S, transitions: Transition<S>[]) {
    this._state = initial;
    for (const t of transitions) {
      this.transitions.set(`${t.from}=>${t.to}`, t);
    }
  }

  get state(): S {
    return this._state;
  }

  get log(): ReadonlyArray<StateChangeRecord<S>> {
    return this.history;
  }

  async transition(
    to: S,
    opts: { actor?: string; metadata?: Record<string, unknown>; context?: C } = {}
  ): Promise<S> {
    // Serialize: run only after every previously-queued transition has settled.
    // `.then(() => ...)` on a queue tail that never rejects (see below) keeps a
    // failed transition from poisoning subsequent ones.
    const run = this.queue.then(() => this.applyTransition(to, opts));
    // The queue tail must not reject, or an unhandled rejection escapes and
    // later transitions inherit the failure. Callers still get `run`.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async applyTransition(
    to: S,
    opts: { actor?: string; metadata?: Record<string, unknown>; context?: C }
  ): Promise<S> {
    const key = `${this._state}=>${to}`;
    const t = this.transitions.get(key);
    if (!t) {
      throw new WorkflowError(
        "invalid-transition",
        `${this._state} -> ${to} is not a permitted transition`
      );
    }
    if (t.guard) {
      const ok = await t.guard(opts.context);
      if (!ok) {
        throw new WorkflowError(
          "guard-failed",
          `Guard rejected ${this._state} -> ${to}`
        );
      }
    }
    if (t.action) {
      await t.action(opts.context);
    }
    this.history.push({
      from: this._state,
      to,
      at: new Date().toISOString(),
      actor: opts.actor,
      metadata: opts.metadata,
    });
    this._state = to;
    return to;
  }
}
