/**
 * Minimal zod-compatible runtime validator.
 *
 * The console intentionally has zero runtime dependencies beyond Next/React,
 * so we ship a tiny structural validator with the same surface as zod for
 * the cases we actually use. If/when we add zod as a dep, swap this for
 * `import { z } from "zod"` and the rest of the code stays the same.
 */

export type ZodSchema<T> = {
  parse: (input: unknown) => T;
  safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { message: string } };
  _t?: T;
};

function fail(msg: string): never {
  throw new TypeError(msg);
}

function safe<T>(schema: ZodSchema<T>): ZodSchema<T> {
  return {
    parse: schema.parse,
    safeParse: (input: unknown) => {
      try {
        return { success: true, data: schema.parse(input) };
      } catch (e) {
        return { success: false, error: { message: String((e as Error).message ?? e) } };
      }
    },
  };
}

const string = (): ZodSchema<string> =>
  safe({ parse: (i: unknown) => (typeof i === "string" ? i : fail("expected string")) } as ZodSchema<string>);

// A number schema is fully chainable: every constraint returns the same rich
// type, and each method *composes* onto the current parser so that chains like
// `.min(0).max(1)` enforce every constraint (not just the last one).
type NumberSchema = ZodSchema<number> & {
  int: () => NumberSchema;
  nonnegative: () => NumberSchema;
  positive: () => NumberSchema;
  min: (n: number) => NumberSchema;
  max: (n: number) => NumberSchema;
};

const makeNumber = (parse: (i: unknown) => number): NumberSchema => {
  const self = safe({ parse } as ZodSchema<number>);
  const chain = (extra: (n: number) => void): NumberSchema =>
    makeNumber((i: unknown) => { const n = parse(i); extra(n); return n; });
  return Object.assign(self, {
    int: () => chain((n) => { if (!Number.isInteger(n)) fail("expected integer"); }),
    nonnegative: () => chain((n) => { if (n < 0) fail("expected nonnegative"); }),
    positive: () => chain((n) => { if (n <= 0) fail("expected positive"); }),
    min: (m: number) => chain((n) => { if (n < m) fail(`expected >= ${m}`); }),
    max: (m: number) => chain((n) => { if (n > m) fail(`expected <= ${m}`); }),
  }) as NumberSchema;
};

const numberBase = (): NumberSchema =>
  makeNumber((i: unknown) => (typeof i === "number" && Number.isFinite(i) ? i : fail("expected number")));

const number = numberBase;

const enumOf = <const T extends readonly string[]>(vals: T): ZodSchema<T[number]> =>
  safe({
    parse: (i: unknown) =>
      typeof i === "string" && (vals as readonly string[]).includes(i)
        ? (i as T[number])
        : fail(`expected one of ${vals.join(",")}`),
  } as ZodSchema<T[number]>);

const object = <T extends Record<string, ZodSchema<unknown>>>(shape: T): ZodSchema<{ [K in keyof T]: T[K] extends ZodSchema<infer U> ? U : never }> => {
  type Out = { [K in keyof T]: T[K] extends ZodSchema<infer U> ? U : never };
  return safe({
    parse: (i: unknown) => {
      if (typeof i !== "object" || i === null || Array.isArray(i)) fail("expected object");
      const out = {} as Out;
      for (const k of Object.keys(shape) as Array<keyof T>) {
        try {
          (out as Record<string, unknown>)[k as string] = shape[k].parse((i as Record<string, unknown>)[k as string]);
        } catch (e) {
          fail(`field ${String(k)}: ${(e as Error).message}`);
        }
      }
      return out;
    },
  } as ZodSchema<Out>);
};

const array = <T>(inner: ZodSchema<T>): ZodSchema<T[]> =>
  safe({
    parse: (i: unknown) => {
      if (!Array.isArray(i)) fail("expected array");
      return i.map((v, idx) => {
        try { return inner.parse(v); } catch (e) { fail(`[${idx}]: ${(e as Error).message}`); }
      });
    },
  } as ZodSchema<T[]>);

export const z = {
  string,
  number,
  enum: enumOf,
  object,
  array,
  infer: undefined as never,
} as const;

// type helper to mimic zod's `z.infer<...>`
export type infer<S> = S extends ZodSchema<infer T> ? T : never;
// re-export under the `z` namespace shape that zod uses
export namespace z {
  export type infer<S> = S extends ZodSchema<infer T> ? T : never;
}
