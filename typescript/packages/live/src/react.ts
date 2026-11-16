import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { InputOf, OutputOf, Registry } from '@eeao/core';
import type { Live, Procs, QueryOptions, QueryState } from './index.js';

export type UseQueryResult<T> = QueryState<T> & {
  /** `status === 'loading'`, for the first load only. Later refetches keep the old data. */
  loading: boolean;
  refetch: () => Promise<void>;
};

/**
 * Hooks over a `createLive(...)` instance:
 *
 *   const { useQuery, useMutation } = createLiveHooks(live);
 *   const messages = useQuery('messages.list', { channel });   // refetches when its topics fire
 *   const send = useMutation('messages.send');
 */
export function createLiveHooks<R extends Registry<any>>(live: Live<R>) {
  function useQuery<N extends keyof Procs<R> & string>(
    name: N,
    input: InputOf<Procs<R>[N]>,
    options: QueryOptions = {},
  ): UseQueryResult<OutputOf<Procs<R>[N]>> {
    const topicsKey = JSON.stringify(options.topics ?? null);
    const handle = useMemo(
      () => live.query(name, input, options),
      // The input and topics are compared by value, so an inline object does not resubscribe.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [name, JSON.stringify(input), topicsKey, options.enabled],
    );
    const state = useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);
    return { ...state, loading: state.status === 'loading', refetch: handle.refetch } as UseQueryResult<OutputOf<Procs<R>[N]>>;
  }

  function useMutation<N extends keyof Procs<R> & string>(name: N) {
    const [pending, setPending] = useState(0);
    const [error, setError] = useState<Error | undefined>();
    const mutate = useCallback(
      async (input: InputOf<Procs<R>[N]>) => {
        setPending((n) => n + 1);
        setError(undefined);
        try {
          return await live.mutate(name, input);
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          setError(err);
          throw err;
        } finally {
          setPending((n) => n - 1);
        }
      },
      [name],
    );
    return { mutate, pending: pending > 0, error };
  }

  return { useQuery, useMutation };
}
