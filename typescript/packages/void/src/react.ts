import type { Registry } from '@eeao/core';
import { createLive, type LiveOptions } from '@eeao/live';
import { createLiveHooks } from '@eeao/live/react';
import { voidTransport, type VoidTransportOptions } from './live.js';

export type { ConnectLiveStream } from './live.js';

/**
 * `useQuery` and `useMutation` for a Void app: an eeao RPC call plus Void live topics.
 *
 *   // src/live.ts
 *   import { connectLiveStream } from 'void/live/client';
 *   export const { useQuery, useMutation, live } = createVoidLive<typeof registry>({
 *     client: createClient('/rpc'),
 *     connect: connectLiveStream,
 *     topics: { 'messages.list': (i) => [`messages:channel:${i.channel}`] },
 *   });
 */
export function createVoidLive<R extends Registry<any>>(options: Omit<LiveOptions<R>, 'transport'> & Pick<VoidTransportOptions, 'connect' | 'url' | 'withCredentials' | 'retryDelay' | 'onError'>) {
  const { connect, url, withCredentials, retryDelay, onError, ...rest } = options;
  const live = createLive<R>({ ...rest, transport: voidTransport({ connect, url, withCredentials, retryDelay, onError }) });
  return { live, ...createLiveHooks<R>(live) };
}
