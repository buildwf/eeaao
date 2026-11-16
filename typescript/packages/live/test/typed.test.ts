import { describe, expectTypeOf, it } from 'vitest';
import type { Live, Procs, Typed } from '../src/index.js';
import type { AnyProcedure } from '@eeao/core';

// A generated procedure map (what `void` emits) is a plain `{ '~procedures': Map }`, not a Registry.
type Map = { 'count.get': AnyProcedure };
type Typed1 = { readonly '~procedures'?: Map };

describe('typed procedures', () => {
  it('accepts a bare ~procedures map and keeps its names, inputs and outputs', () => {
    expectTypeOf<Typed1>().toExtend<Typed>();
    expectTypeOf<keyof Procs<Typed1>>().toEqualTypeOf<'count.get'>();
    expectTypeOf<Live<Typed1>>().not.toBeNever();
  });
  it('is never for a type without procedures', () => {
    expectTypeOf<Procs<{}>>().toBeNever();
  });
});
