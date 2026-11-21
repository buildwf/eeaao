# Live protocol for native apps

A bwf live stream (`defineLiveStream` from `@builtbyfriends/bwf/live`) is plain HTTP. A browser uses `connectLiveStream`, but any client that can read a server-sent-event stream and send a JSON POST can listen. This page describes what goes over the wire, so a Swift, Kotlin or other client can do it. The [Swift](../swift/README.md) and [Kotlin](../kotlin/README.md) packages here implement it.

The route is one URL with two methods. In bwf's guide it's `routes/live.ts`, so `GET /live` opens the stream and `POST /live` subscribes and unsubscribes.

## Open the stream

```
GET /live?connectionId=<id>
Accept: text/event-stream
Authorization: Bearer <token>
```

- `connectionId` is a string you make up, 16 to 256 characters with no line breaks. A UUID works. Keep the same id for the life of the client, including across reconnects.
- The response is `200` with `content-type: text/event-stream`. Any other status means the stream didn't open. The body is a JSON error (see [Errors](#errors)).
- The server sends a comment (`: connected`) first, then a comment (`: keep-alive`) about every 15 seconds. Treat 60 seconds of silence as a dead connection and reconnect.

## Read events

An event is a server-sent-event frame. Lines start with a field name and a colon, and a blank line ends the frame. Comment lines start with `:` and carry nothing. Every event frame looks like this:

```
event: message
data: {"subscriptionId":"post-card","topic":"post:12","type":"updated","eventId":"post-12-v8","data":{"title":"New"}}

```

The `data` line is JSON:

| Field | Meaning |
| --- | --- |
| `subscriptionId` | The `id` you gave when you subscribed. |
| `topic` | The topic that was published to. |
| `type` | Optional. A label the publisher chose. |
| `eventId` | Optional. An id the publisher chose. |
| `data` | The payload. Any JSON. |

bwf doesn't use the SSE `id:` field or `Last-Event-ID`. Keep `eventId` yourself if you want to send it back as `lastEventId` when you subscribe.

Check that `subscriptionId` is one you hold and that `topic` matches the topic you subscribed with. Drop the frame otherwise.

## Subscribe and unsubscribe

```
POST /live
Content-Type: application/json
Authorization: Bearer <token>

{
  "connectionId": "<id>",
  "operations": [
    { "kind": "subscribe", "id": "post-card", "topic": "post:12", "lastEventId": "post-12-v7" },
    { "kind": "unsubscribe", "id": "comments" }
  ]
}
```

- Send the POST after the stream has opened. Subscribing to a connection that isn't open fails with `CONNECTION_NOT_FOUND`.
- `id` is yours, 1 to 256 characters, and scoped to the connection. Subscribing with an id that's in use replaces that subscription.
- `topic` is 1 to 512 characters. `lastEventId` is optional.
- Send up to 100 operations in one request.

A `200` answer looks like this. Check each result, because one operation can fail while the others work:

```json
{
  "accepted": true,
  "connectionId": "<id>",
  "results": [
    { "ok": true, "kind": "subscribe", "id": "post-card", "topic": "post:12" },
    { "ok": false, "kind": "subscribe", "id": "other", "error": { "code": "FORBIDDEN", "message": "Forbidden" } }
  ]
}
```

## Errors

A request that fails as a whole answers with a non-200 status and this body:

```json
{ "accepted": false, "error": { "code": "FORBIDDEN", "message": "live: anonymous control is not enabled." } }
```

`error.code` is one of `BAD_REQUEST`, `CONNECTION_CLOSED`, `CONNECTION_NOT_FOUND`, `FORBIDDEN`, `INVALID_SUBSCRIPTION_ID`, `INVALID_TOPIC`, `OWNER_MISMATCH`, `SUBSCRIPTION_LIMIT`, `TOPIC_FULL`, `PAYLOAD_TOO_LARGE` or `INTERNAL_ERROR`.

A `401` or `403` on the stream usually means the token is missing or expired. Refresh it and open the stream again. `CONNECTION_CLOSED` or `CONNECTION_NOT_FOUND` on a subscribe means the server no longer has the connection, so reconnect.

## Reconnect

Delivery is at most once and nothing is replayed. When a stream drops, events during the gap are lost, and the server forgets your subscriptions with it. A client does this:

1. Open the stream again, with the same `connectionId`.
2. Subscribe to every topic it was holding, in one POST.
3. Tell the app it reconnected, so the app can fetch again what it may have missed.

Wait a little longer between each failed attempt. The reference clients wait 1, 2, 4, 8, 16 and then 30 seconds.

## Who owns a connection

The server decides who a connection belongs to, and only that owner can change its subscriptions. For a browser, bwf uses the signed-in user. For a bearer token, set the owner yourself, once, with `identifyConnection`. It runs for `GET` and for `POST`, so both requests need the token.

```ts
// src/live.ts
import { defineLiveStream } from '@builtbyfriends/bwf/live';

export const live = defineLiveStream({
  id: 'app',
  async identifyConnection({ request, env }) {
    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    const session = token ? await findSessionByToken(env, token) : null;
    return session ? `user:${session.userId}` : null;
  },
  async onSubscribe({ owner, topic }) {
    // Decide who can read each topic. Without this, any owner can read any topic.
    if (topic === `user:${owner?.replace('user:', '')}:inbox`) return;
    return new Response('Forbidden', { status: 403 });
  },
});
```

If `identifyConnection` returns `null`, bwf falls back to the cookie session's user. If that finds nobody and `allowAnonymousControl` isn't set, the request is refused with `403`. An owner is any string up to 512 characters, so `user:<id>` is a convention.

The owner doesn't limit which topics the connection can read. Use `onSubscribe` for that.

## Limits

By default a stream allows 256 subscriptions per connection, 256 per topic, 100 operations per control request, 100 queued events per connection and 64 KiB per event. The server closes a connection that falls too far behind.

## In JavaScript

An app that runs in JavaScript but signs in with a token, such as React Native, can use `bwfTransport` or `createBwfLive` from `@builtbyfriends/realtime-bwf/react` with the `headers` option. It uses a fetch-based stream that sends the headers, in place of the browser `EventSource`.

```ts
createBwfLive({
  client: createClient(base, { token: () => getToken() }),
  connect: connectLiveStream,
  url: `${base}/live`,
  headers: () => ({ authorization: `Bearer ${getToken()}` }),
  topics,
});
```
