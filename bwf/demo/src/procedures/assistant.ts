import { z } from 'zod';
import { appRegistry, procedure } from '@eeao/bwf';
import { anthropicTools, runTool, toolResultContent } from '@eeao/ai';
import { env as config } from '@buildwf/bwf/env';
import { signedIn } from './_shared';

const Block = z.object({ type: z.string() }).passthrough();
const Message = z.object({ role: z.enum(['user', 'assistant']), content: z.union([z.string(), z.array(Block)]) });
type Msg = z.infer<typeof Message>;
type ToolUse = { type: 'tool_use'; id: string; name: string; input: unknown };

const toolUses = (m: Msg | undefined): ToolUse[] =>
  m?.role === 'assistant' && Array.isArray(m.content) ? (m.content.filter((b) => b.type === 'tool_use') as unknown as ToolUse[]) : [];

/**
 * An agent inside the app. It calls Claude with the app's own AI tools and runs each tool
 * call as the signed-in user, so the tools' auth, policies and approvals all apply. When a
 * tool needs approval the turn stops and returns `pending`; send the same messages back
 * with `approve` (tool_use ids) or `decline` to continue.
 */
export const ask = procedure('assistant.ask')
  .use(signedIn)
  .input(
    z.object({
      orgId: z.string(),
      messages: z.array(Message).min(1),
      approve: z.array(z.string()).default([]),
      decline: z.array(z.string()).default([]),
    }),
  )
  .authz({ policy: 'same-org', check: (user, input) => user.orgId === input.orgId })
  .output(
    z.object({
      messages: z.array(Message),
      reply: z.string(),
      pending: z.array(z.object({ id: z.string(), tool: z.string(), input: z.unknown() })),
    }),
  )
  .errors({ MODEL_ERROR: { status: 502, message: 'The model API did not answer' } })
  .analytics({ event: 'assistant.asked', props: (input) => ({ orgId: input.orgId, turns: input.messages.length }) })
  .noMcp({ reason: 'MCP clients already have their own model and call the tools directly' })
  .noCli({ reason: 'Approving tool calls needs an interactive chat screen' })
  .noAiTool({ reason: 'This is the agent itself; offering it as a tool would recurse' })
  .handler(async ({ input, ctx, env, request, waitUntil, fail }) => {
    const registry = appRegistry();
    const tools = anthropicTools(registry);
    const messages: Msg[] = [...input.messages];
    const system = `You help ${ctx.id} manage contacts in organization ${ctx.orgId}. Use the tools; never guess ids.`;

    for (let turn = 0; turn < 8; turn++) {
      // Run tool calls the model asked for that have no result yet (on a later call, after approval).
      const asked = toolUses(messages[messages.length - 1]);
      if (asked.length) {
        const results = [];
        const pending = [];
        for (const t of asked) {
          if (input.decline.includes(t.id)) {
            results.push({ type: 'tool_result', tool_use_id: t.id, content: 'The person declined this call.', is_error: true });
            continue;
          }
          const run = await runTool(registry, t.name, t.input, { request, env, waitUntil, approved: input.approve.includes(t.id) });
          if (run.status === 'needs_approval') pending.push({ id: t.id, tool: t.name, input: t.input });
          else results.push({ type: 'tool_result', tool_use_id: t.id, ...toolResultContent(run) });
        }
        if (pending.length) return { messages, reply: '', pending };
        messages.push({ role: 'user', content: results });
      }

      const res = await fetch(`${config.ANTHROPIC_BASE_URL}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': config.ANTHROPIC_API_KEY ?? '' },
        body: JSON.stringify({ model: config.ANTHROPIC_MODEL, max_tokens: 1024, system, tools, messages }),
      }).catch(() => null);
      if (!res?.ok) return fail('MODEL_ERROR');
      const reply = (await res.json()) as { content: Msg['content']; stop_reason: string };
      messages.push({ role: 'assistant', content: reply.content });
      if (reply.stop_reason !== 'tool_use') {
        const text = Array.isArray(reply.content) ? reply.content.filter((b) => b.type === 'text').map((b) => (b as { text?: string }).text).join('\n') : reply.content;
        return { messages, reply: text, pending: [] };
      }
    }
    return { messages, reply: 'Stopped after 8 model calls.', pending: [] };
  });
