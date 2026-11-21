import type { ChangeBatch, PullResult } from './changes.js';

/**
 * Devices hold a hibernating WebSocket on the data object itself. Each socket's attachment says who it is and which
 * sync groups it may read, so a commit goes straight to the sockets that should see it, filtered per socket, with the
 * changed documents in the message. A sleeping socket bills nothing, and outgoing messages are free.
 *
 * The door (the Worker in front) decides who the caller is and which groups they may read. The object trusts it.
 *
 * Wire format, JSON text frames:
 *   device → object  {"type":"pull","after":12,"id":1}
 *   object → device  {"type":"pull","id":1,"seq":40,"changes":[...],"more":false}
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

/** Socket attachments hold at most 16 KiB. */
const MAX_ATTACHMENT = 16_000;

export class SyncSockets {
  constructor(
    private readonly state: State,
    private readonly pull: (groups: string[], after: number, limit?: number) => PullResult,
  ) {}

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
      const changes = batch.changes.filter((c) => mine.has(c.group));
      trySend(ws, { type: 'changes', seq: batch.seq, changes });
    }
  }

  /** Answers a device's message. Returns false when it isn't a sync message, so the object can handle it. */
  message(ws: Socket, raw: string | ArrayBuffer): boolean {
    if (typeof raw !== 'string') return false;
    let msg: { type?: string; after?: number; id?: unknown; limit?: number };
    try {
      msg = JSON.parse(raw);
    } catch {
      return false;
    }
    if (msg.type !== 'pull') return false;
    const who = identity(ws);
    if (!who) return true;
    const after = Number.isFinite(msg.after) && msg.after! >= 0 ? msg.after! : 0;
    trySend(ws, { type: 'pull', id: msg.id, ...this.pull(who.groups, after, msg.limit) });
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
}

function identity(ws: Socket): SocketIdentity | null {
  const v = ws.deserializeAttachment() as SocketIdentity | null;
  return v && typeof v.actor === 'string' && Array.isArray(v.groups) ? v : null;
}

function trySend(ws: Socket, message: unknown): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket closed between the commit and the send. The device pulls on reconnect.
  }
}
