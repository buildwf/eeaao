import { describe, expect, it } from 'vitest';
import { defineData, defineSchema, SyncSockets, table } from '../src/index.js';
import { memoryStorage } from './storage.js';

const schema = defineSchema({
  notes: table<{ room: string; text: string }>({ sync: { group: (n) => `room:${n.room}` } }),
});

function setup() {
  const data = defineData({ schema, functions: ({ mutation }) => ({ add: mutation((ctx, a: { room: string; text: string }) => ctx.db.insert('notes', a)) }) });
  const engine = data.engine(memoryStorage());
  engine.init();
  const all: { tags: string[]; ws: ReturnType<typeof fakeSocket> }[] = [];
  const state = {
    acceptWebSocket: (ws: any, tags: string[] = []) => void all.push({ ws, tags }),
    getWebSockets: (tag?: string) => all.filter((s) => !tag || s.tags.includes(tag)).map((s) => s.ws),
  };
  const sockets = new SyncSockets(state, (g, a, l) => engine.pull(g, a, l));
  engine.listen((batch) => sockets.broadcast(batch));
  const add = (room: string, text: string) => engine.run('mutation', 'add', { room, text });
  return { sockets, add };
}

function fakeSocket() {
  let attachment: unknown = null;
  const sent: any[] = [];
  return { sent, send: (m: string) => void sent.push(JSON.parse(m)), serializeAttachment: (v: unknown) => void (attachment = v), deserializeAttachment: () => attachment };
}

describe('sync sockets', () => {
  it('sends each socket only the changes in its groups', async () => {
    const { sockets, add } = setup();
    const a = fakeSocket();
    const b = fakeSocket();
    sockets.accept(a, { actor: 'ann', groups: ['room:x'] });
    sockets.accept(b, { actor: 'bo', groups: ['room:y'] });
    await add('x', 'hello');
    expect(a.sent).toEqual([{ type: 'changes', seq: 1, changes: [expect.objectContaining({ group: 'room:x', doc: expect.objectContaining({ text: 'hello' }) })] }]);
    expect(b.sent).toEqual([]);
  });

  it('answers a pull, and tells a socket about groups it gained and lost', async () => {
    const { sockets, add } = setup();
    await add('x', 'one');
    await add('y', 'two');
    const a = fakeSocket();
    sockets.accept(a, { actor: 'ann', groups: ['room:x'] });
    expect(sockets.message(a, JSON.stringify({ type: 'pull', after: 0, id: 7 }))).toBe(true);
    expect(a.sent[0]).toMatchObject({ type: 'pull', id: 7, seq: 2, more: false, changes: [{ group: 'room:x' }] });
    sockets.regroup('ann', ['room:y']);
    expect(a.sent[1]).toEqual({ type: 'groups', added: ['room:y'], removed: ['room:x'] });
    await add('x', 'unseen');
    expect(a.sent).toHaveLength(2);
    expect(sockets.message(a, 'not json')).toBe(false);
  });
});
