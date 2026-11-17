import { createLive, type LiveOptions, type Typed } from '@eeao/live';
import { createLiveHooks } from '@eeao/live/react';
import { nosamTransport, type NosamTransportOptions } from './live.js';

export type { ConnectLiveStream } from './live.js';

/**
 * `useQuery` and `useMutation` for a Nosam app: an eeao RPC call plus Nosam live topics.
 *
 *   // src/live.ts
 *   import { connectLiveStream } from 'nosam/live/client';
 *   export const { useQuery, useMutation, live } = createNosamLive<typeof registry>({
 *     client: createClient('/rpc'),
 *     connect: connectLiveStream,
 *     topics: { 'messages.list': (i) => [`messages:channel:${i.channel}`] },
 *   });
 */
export function createNosamLive<R extends Typed>(options: Omit<LiveOptions<R>, 'transport'> & Pick<NosamTransportOptions, 'connect' | 'url' | 'withCredentials' | 'retryDelay' | 'onError'>) {
  const { connect, url, withCredentials, retryDelay, onError, ...rest } = options;
  const live = createLive<R>({ ...rest, transport: nosamTransport({ connect, url, withCredentials, retryDelay, onError }) });
  return { live, ...createLiveHooks<R>(live) };
}
