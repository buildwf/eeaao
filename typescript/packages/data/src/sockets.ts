import type { Change, ChangeBatch, PullResult } from './changes.js';

/**
 * Devices hold a hibernating WebSocket on the data object itself. Each socket's attachment says who it is and which
 * sync groups it reads, so a commit goes straight to the sockets that should see it, filtered per socket, with the
 * changed documents in the message. A sleeping socket bills nothing, and outgoing messages are free.
 *
 * The door (the Worker in front) decides who the caller is, and can hand it groups it may read. A device can also ask
 * to watch more groups as it moves around. The object checks those itself (`access`), since it holds the data.
 *
 * Wire format, JSON text frames:
 *   device → object  {"type":"pull","after":12,"id":1}
 *   object → device  {"type":"pull","id":1,"seq":40,"changes":[...],"more":false}
 *   device → object  {"type":"watch","groups":["channel:x"],"after":38,"id":2}   `after` is optional
 *   object → device  {"type":"watching","id":2,"groups":["channel:x"],"denied":[],"seq":40,"changes":[...],"more":false}
 *   device → object  {"type":"unwatch","groups":["channel:x"]}
 *   object → device  {"type":"changes","seq":41,"changes":[...]}   after each commit that touches its groups
 *   object → device  {"type":"groups","added":["team:x"],"removed":["team:y"]}   drop what's in removed
 */
export type SocketIdentity = { actor: string; groups: string[] };

type Socket = {
  send(message: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
};

type State = {
  acceptWebSocket(ws: unknown, tags?: string[]): void;
  getWebSockets(tag?: string): Socket[];
};

/** What the sockets need from the data object. */
export type SyncHooks = {
  pull(actor: string, groups: string[], after: number, limit?: number): PullResult;
  /** The changes as this actor sees them. Leave it out to send them as they are. */
  view?(actor: string, changes: Change[]): Change[];
  /** The groups out of `groups` this actor may read. Leave it out to refuse every watch. */
  access?(actor: string, groups: string[]): string[];
};

// Decision: socket attachments hold at most 16 KiB, so stay under that.
const MAX_ATTACHMENT = 16_000;

export class SyncSockets {
  private readonly hooks: SyncHooks;

  constructor(
    private readonly state: State,
    hooks: SyncHooks | ((groups: string[], after: number, limit?: number) => PullResult),
  ) {
    this.hooks = typeof hooks === 'function' ? { pull: (_actor, groups, after, limit) => hooks(groups, after, limit) } : hooks;
  }

  /** Accepts the server end of a WebSocketPair for this caller. */
  accept(ws: Socket, who: SocketIdentity): void {
    const attachment = { actor: who.actor, groups: [...new Set(who.groups)] };
    if (JSON.stringify(attachment).length > MAX_ATTACHMENT) throw new Error('too many sync groups for one socket');
    this.state.acceptWebSocket(ws, [`actor:${who.actor}`]);
    ws.serializeAttachment(attachment);
  }

  /** Sends a commit to the sockets whose groups it touches, each with only its own groups' documents. */
  broadcast(batch: ChangeBatch): void {
    const groups = new Set(batch.changes.map((c) => c.group));
    for (const ws of this.state.getWebSockets()) {
      const who = identity(ws);
      if (!who || !who.groups.some((g) => groups.has(g))) continue;
      const mine = new Set(who.groups);
      const changes = this.see(who.actor, batch.changes.filter((c) => mine.has(c.group)));
      if (changes.length) trySend(ws, { type: 'changes', seq: batch.seq, changes });
    }
  }

  /** Answers a device's message. Returns false when it isn't a sync message, so the object can handle it. */
  message(ws: Socket, raw: string | ArrayBuffer): boolean {
    if (typeof raw !== 'string') return false;
    let msg: { type?: string; after?: number; id?: unknown; limit?: number; groups?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return false;
    }
    if (msg.type !== 'pull' && msg.type !== 'watch' && msg.type !== 'unwatch') return false;
    const who = identity(ws);
    if (!who) return true;
    const after = Number.isFinite(msg.after) && msg.after! >= 0 ? msg.after! : 0;
    if (msg.type === 'pull') {
      trySend(ws, { type: 'pull', id: msg.id, ...this.pulled(who.actor, who.groups, after, msg.limit) });
      return true;
    }
    const asked = Array.isArray(msg.groups) ? [...new Set(msg.groups.filter((g): g is string => typeof g === 'string'))] : [];
    if (msg.type === 'unwatch') {
      this.save(ws, { actor: who.actor, groups: who.groups.filter((g) => !asked.includes(g)) });
      return true;
    }
    const allowed = asked.length && this.hooks.access ? this.hooks.access(who.actor, asked) : [];
    const denied = asked.filter((g) => !allowed.includes(g));
    const next = { actor: who.actor, groups: [...new Set([...who.groups, ...allowed])] };
    if (!this.save(ws, next)) {
      trySend(ws, { type: 'watching', id: msg.id, groups: [], denied: asked, seq: 0, changes: [], more: false });
      return true;
    }
    // Decision: without `after`, answer only the position. The device loads the groups through queries, which reads less than a pull from 0.
    const caught = msg.after === undefined ? { ...this.hooks.pull(who.actor, [], 0), more: false } : this.pulled(who.actor, allowed, after, msg.limit);
    trySend(ws, { type: 'watching', id: msg.id, groups: allowed, denied, ...caught });
    return true;
  }

  /**
   * Changes the groups an actor's sockets may read, after they join or leave something. Each socket is told what was
   * added (pull it from 0) and what was removed (drop it from the device).
   */
  regroup(actor: string, groups: string[]): void {
    const next = [...new Set(groups)];
    for (const ws of this.state.getWebSockets(`actor:${actor}`)) {
      const who = identity(ws);
      if (!who) continue;
      const added = next.filter((g) => !who.groups.includes(g));
      const removed = who.groups.filter((g) => !next.includes(g));
      if (!added.length && !removed.length) continue;
      ws.serializeAttachment({ actor, groups: next });
      trySend(ws, { type: 'groups', added, removed });
    }
  }

  /**
   * Checks every socket's groups again, after a commit that may have changed who can read what (someone left, a channel
   * went private). Each socket is told what it lost.
   */
  recheck(): void {
    const access = this.hooks.access;
    for (const ws of this.state.getWebSockets()) {
      const who = identity(ws);
      if (!who || !who.groups.length) continue;
      const kept = access ? access(who.actor, who.groups) : [];
      const removed = who.groups.filter((g) => !kept.includes(g));
      if (!removed.length) continue;
      ws.serializeAttachment({ actor: who.actor, groups: who.groups.filter((g) => kept.includes(g)) });
      trySend(ws, { type: 'groups', added: [], removed });
    }
  }

  private pulled(actor: string, groups: string[], after: number, limit?: number): PullResult {
    const result = this.hooks.pull(actor, groups, after, limit);
    return { ...result, changes: this.see(actor, result.changes) };
  }

  private see(actor: string, changes: Change[]): Change[] {
    return this.hooks.view ? this.hooks.view(actor, changes) : changes;
  }

  private save(ws: Socket, who: SocketIdentity): boolean {
    if (JSON.stringify(who).length > MAX_ATTACHMENT) return false;
    ws.serializeAttachment(who);
    return true;
  }
}

function identity(ws: Socket): SocketIdentity | null {
  const v = ws.deserializeAttachment() as SocketIdentity | null;
  return v && typeof v.actor === 'string' && Array.isArray(v.groups) ? v : null;
}

function trySend(ws: Socket, message: unknown): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Decision: the socket closed between the commit and the send. The device pulls on reconnect.
  }
}
