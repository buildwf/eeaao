import { createLive, type LiveOptions, type Typed } from '@eeao/live';
import { createLiveHooks } from '@eeao/live/react';
import { bwfTransport, type BwfTransportOptions } from './live.js';

export type { ConnectLiveStream } from './live.js';

/**
 * `useQuery` and `useMutation` for a bwf app: an eeao RPC call plus bwf live topics.
 *
 *   // src/live.ts
 *   import { connectLiveStream } from '@buildwf/bwf/live/client';
 *   export const { useQuery, useMutation, live } = createBwfLive<typeof registry>({
 *     client: createClient('/rpc'),
 *     connect: connectLiveStream,
 *     topics: { 'messages.list': (i) => [`messages:channel:${i.channel}`] },
 *   });
 */
export function createBwfLive<R extends Typed>(options: Omit<LiveOptions<R>, 'transport'> & Pick<BwfTransportOptions, 'connect' | 'url' | 'withCredentials' | 'retryDelay' | 'onError'>) {
  const { connect, url, withCredentials, retryDelay, onError, ...rest } = options;
  const live = createLive<R>({ ...rest, transport: bwfTransport({ connect, url, withCredentials, retryDelay, onError }) });
  return { live, ...createLiveHooks<R>(live) };
}
