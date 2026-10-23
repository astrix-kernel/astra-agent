import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProvider } from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAI-compatible provider streaming', () => {
  it('flushes a final unterminated SSE line and emits one tool call with the final ID', async () => {
    const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

    const frames = [
      frame({
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_temp' }] } }],
      }),
      frame({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_real',
              function: { name: 'fs.', arguments: '{"path":' },
            }],
          },
        }],
      }),
      frame({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { name: 'write', arguments: '"a.txt","content":' },
            }],
          },
        }],
      }),
      // Deliberately omit the final newline to exercise EOF buffer flushing.
      `data: ${JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: '"hello"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      })}`,
    ];

    const streamText = frames.join('');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamText));
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })),
    );

    const provider = createProvider({
      type: 'openai',
      apiKey: 'test-key',
      baseUrl: 'https://provider.test/v1',
      modelId: 'test-model',
    });

    const events = [];
    for await (const event of provider.streamChat({
      messages: [],
      tools: [],
      stream: true,
    })) {
      events.push(event);
    }

    const toolCalls = events.filter((event) => event.type === 'tool_call');

    expect(events.some((event) => event.type === 'error')).toBe(false);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.toolCall).toEqual({
      id: 'call_real',
      name: 'fs.write',
      arguments: '{"path":"a.txt","content":"hello"}',
    });
  });
});
