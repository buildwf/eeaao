/** Server side: connects `@eeao/data` to a Void `defineLiveStream()`. */

type Publisher = { withEnv(env: any): { publish(topic: string, data: unknown, options?: { type?: string; eventId?: string }): Promise<void> } };

/**
 * `onCommit` for `defineData`: publishes a `changed` event on every topic a mutation touched.
 * The payload is empty on purpose. Delivery is at most once, so clients refetch instead of
 * applying events. It runs inside the Durable Object, which has no request, hence `withEnv`.
 *
 *   defineData({ ..., onCommit: publishTopics(live) })
 */
export function publishTopics(live: Publisher) {
  return async (topics: string[], env: unknown) => {
    const stream = live.withEnv(env);
    await Promise.all(topics.map((topic) => stream.publish(topic, null, { type: 'changed' })));
  };
}

export type TopicContext = { topic: string; user: unknown; owner: string | null; env: any; request: Request };
export type TopicRule = {
  /** Matched against the whole topic. Capture groups are passed to `allow`. */
  pattern: RegExp;
  allow: (match: string[], ctx: TopicContext) => boolean | Promise<boolean>;
};

/**
 * `onSubscribe` for `defineLiveStream`: allow a topic only when a rule matches and agrees.
 * A topic no rule matches is refused, because without this any signed-in user could listen
 * to any topic.
 *
 *   defineLiveStream({ id: 'app', onSubscribe: topicPolicy([
 *     { pattern: /^messages:channel:(.+)$/, allow: ([, channel], ctx) => canRead(ctx.user, channel) },
 *   ]) })
 */
export function topicPolicy(rules: TopicRule[]) {
  return async (ctx: TopicContext): Promise<Response | void> => {
    for (const { pattern, allow } of rules) {
      const m = pattern.exec(ctx.topic);
      if (m && m[0] === ctx.topic && (await allow([...m], ctx))) return;
    }
    return new Response('Forbidden', { status: 403 });
  };
}
