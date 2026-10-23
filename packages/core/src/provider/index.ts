import type { ChatEvent, ChatRequest, ChatResponse, ProviderError } from '../types/chat.js';
import type { Message} from '../types/messages.js';
import { textContentOf } from '../types/messages.js';

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: OpenAIToolCall[];
}

function toOpenAIMessages(
  messages: Message[],
  providerToolNameByInternal?: Map<string, string>,
): OpenAIMessage[] {
  const sanitizeToolName = (name: string): string =>
    providerToolNameByInternal?.get(name)
      ?? (name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'tool');
  return messages.map((msg): OpenAIMessage => {
    // Tool result message: must have tool_call_id
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        ...(msg.toolCallId ? { tool_call_id: msg.toolCallId } : {}),
        ...(msg.name ? { name: msg.name } : {}),
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      };
    }
    // Assistant message requesting tool call
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return {
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : '',
        tool_calls: msg.toolCalls.map((call): OpenAIToolCall => ({
          id: call.id,
          type: 'function',
          function: { name: sanitizeToolName(call.name), arguments: call.arguments },
        })),
      };
    }
    // Normal message (system / user / assistant text)
    return {
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    };
  });
}

export interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: {
    toolCalling: boolean;
    structuredOutput: boolean;
    multimodal: boolean;
    maxContextTokens: number;
    maxOutputTokens: number;
  };
  countTokens(messages: Message[]): Promise<number>;
  completeChat(request: ChatRequest): Promise<ChatResponse>;
  streamChat(request: ChatRequest): AsyncIterable<ChatEvent>;
  healthCheck(): Promise<boolean>;
}

export interface ProviderConfig {
  type: 'openai' | 'mock';
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
}

export function createProvider(config: ProviderConfig): ModelProvider {
  if (config.type === 'mock') return new MockProvider(config.modelId ?? 'mock');
  return new OpenAICompatibleProvider(config);
}

class OpenAICompatibleProvider implements ModelProvider {
  readonly id = 'openai-compatible';
  readonly name = 'OpenAI Compatible';
  readonly capabilities = {
    toolCalling: true,
    structuredOutput: true,
    multimodal: false,
    maxContextTokens: 128000,
    maxOutputTokens: 16384,
  } as const;

  constructor(private readonly config: ProviderConfig) {}

  async countTokens(messages: Message[]): Promise<number> {
    return messages.reduce((total, message) => total + Math.ceil(textContentOf(message).length / 4), 0);
  }

  async completeChat(request: ChatRequest): Promise<ChatResponse> {
    let content = '';
    const toolCalls: NonNullable<ChatResponse['toolCalls']> = [];
    let usage: ChatResponse['usage'];
    for await (const event of this.streamChat({ ...request, stream: true })) {
      if (event.type === 'token' || event.type === 'reasoning') content += event.text ?? '';
      if (event.type === 'tool_call' && event.toolCall) toolCalls.push(event.toolCall);
      if (event.type === 'done') usage = event.usage;
      if (event.type === 'error') throw new Error(event.error?.message ?? 'Provider error');
    }
    return {
      content,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(usage ? { usage } : {}),
      providerId: this.id,
      modelId: request.modelId ?? this.config.modelId ?? 'default',
    };
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ChatEvent> {
    if (!this.config.apiKey) {
      yield { type: 'error', error: { message: 'Missing API key. Set ASTRA_API_KEY.', retryable: false } };
      return;
    }
    const endpoint = `${(this.config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;
    const providerToolNameByInternal = new Map<string, string>();
    const internalToolNameByProvider = new Map<string, string>();
    const usedProviderToolNames = new Set<string>();

    for (const tool of request.tools ?? []) {
      const baseName =
        tool.name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'tool';

      let providerName = baseName;
      let suffix = 2;

      while (usedProviderToolNames.has(providerName)) {
        const suffixText = `_${suffix++}`;
        providerName =
          `${baseName.slice(0, 64 - suffixText.length)}${suffixText}`;
      }

      usedProviderToolNames.add(providerName);
      providerToolNameByInternal.set(tool.name, providerName);
      internalToolNameByProvider.set(providerName, tool.name);
    }

    const resolveInternalToolName = (providerName: string): string => {
      const direct = internalToolNameByProvider.get(providerName);
      if (direct) return direct;
      const stripped = providerName.replace(/_[a-f0-9]{8,}$/i, '');
      const strippedMatch = internalToolNameByProvider.get(stripped);
      if (strippedMatch) return strippedMatch;
      for (const [internal, provider] of providerToolNameByInternal.entries()) {
        if (provider === stripped || provider === providerName) return internal;
      }
      return providerName;
    };

    console.info('[ASTRA_PROVIDER_DIAG] request', JSON.stringify({
      model: request.modelId ?? this.config.modelId ?? null,
      toolChoice: request.toolChoice ?? null,
      toolCount: request.tools?.length ?? 0,
      toolNames: (request.tools ?? []).map(tool => providerToolNameByInternal.get(tool.name) ?? tool.name),
    }));
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.modelId ?? this.config.modelId,
        messages: toOpenAIMessages(request.messages, providerToolNameByInternal),
        tools: request.tools?.map(tool => ({
          type: 'function',
          function: {
            name: providerToolNameByInternal.get(tool.name) ?? tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
        tool_choice: typeof request.toolChoice === 'object'
          ? { type: 'function', function: request.toolChoice.function }
          : request.toolChoice,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    console.info('[ASTRA_PROVIDER_DIAG] response', JSON.stringify({
      status: response.status,
      ok: response.ok,
      hasBody: Boolean(response.body),
    }));
    if (!response.ok || !response.body) {
      const message = await response.text().catch(() => 'Provider request failed');
      const error: ProviderError = { message, status: response.status, retryable: response.status >= 500 || response.status === 429 };
      yield { type: 'error', error };
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const streamedToolCalls = new Map<number, { id: string; name: string; arguments: string }>();
    let lastFinishReason: string | null = null;
    let receivedToolCallDeltas = 0;
    let receivedSseLines = 0;
    let receivedDataLines = 0;
    let parsedSseDataRecords = 0;
    let invalidSseJsonRecords = 0;
    let unrecognizedSseEvents = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          buffer += decoder.decode();
          if (buffer.length === 0) break;
          // Flush the final SSE line even when the stream has no trailing newline.
          buffer += '\n';
        } else {
          buffer += decoder.decode(chunk.value, { stream: true });
        }
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) receivedSseLines += 1;
          const data = line.replace(/^data:\s*/, '').trim();
          if (!data || data === '[DONE]') continue;
          receivedDataLines += 1;
          try {
            if (!data || data.trim() === '[DONE]' || data.trim() === '') continue;
            const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[]; usage?: ChatResponse['usage'] };
            parsedSseDataRecords += 1;
            const parsedRecord = parsed as unknown as Record<string, unknown>;
            const gatewayError = parsedRecord['error'];

            if (gatewayError !== undefined && gatewayError !== null) {
              const errorRecord =
                typeof gatewayError === 'object' && !Array.isArray(gatewayError)
                  ? gatewayError as Record<string, unknown>
                  : undefined;

              const rawMessage =
                typeof gatewayError === 'string'
                  ? gatewayError
                  : typeof errorRecord?.['message'] === 'string'
                    ? errorRecord['message']
                    : typeof errorRecord?.['detail'] === 'string'
                      ? errorRecord['detail']
                      : 'Provider gateway returned an error payload without a message.';

              const redact = (value: string): string =>
                value
                  .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
                  .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');

              const sanitizeDiagnostic = (
                value: unknown,
                depth = 0,
              ): unknown => {
                if (depth > 4) return '[TRUNCATED]';
                if (typeof value === 'string') return redact(value).slice(0, 400);
                if (Array.isArray(value)) {
                  return value.slice(0, 8).map(item =>
                    sanitizeDiagnostic(item, depth + 1)
                  );
                }
                if (value !== null && typeof value === 'object') {
                  const entries = Object.entries(
                    value as Record<string, unknown>
                  ).slice(0, 15);
                  return Object.fromEntries(entries.map(([key, item]) => [
                    key,
                    /api.?key|token|secret|password|authorization|credential/i.test(key)
                      ? '[REDACTED]'
                      : sanitizeDiagnostic(item, depth + 1),
                  ]));
                }
                return value;
              };

              const message = redact(rawMessage).slice(0, 800);
              const recoveryHint =
                typeof parsedRecord['recovery_hint'] === 'string'
                  ? redact(parsedRecord['recovery_hint']).slice(0, 500)
                  : undefined;
              const diagnosticsSummary = JSON.stringify(
                sanitizeDiagnostic(parsedRecord['diagnostics'])
              )?.slice(0, 1600) ?? null;

              console.error(
                '[ASTRA_PROVIDER_DIAG] gateway_error',
                JSON.stringify({
                  message,
                  recoveryHint: recoveryHint ?? null,
                  diagnostics: diagnosticsSummary,
                }),
              );

              const userFacingMessage = [
                `Provider gateway error: ${message}`,
                recoveryHint ? `Recovery hint: ${recoveryHint}` : '',
              ].filter(Boolean).join(' ');

              yield {
                type: 'error',
                error: { message: userFacingMessage, retryable: false },
              };
              return;
            }

            const choice = parsed.choices?.[0];

            if (!choice || (!choice.delta && !choice.finish_reason)) {
              unrecognizedSseEvents += 1;
              if (unrecognizedSseEvents <= 5) {
                const responseValue = parsedRecord['response'];
                const responseKeys =
                  responseValue !== null && typeof responseValue === 'object'
                    ? Object.keys(responseValue as Record<string, unknown>).slice(0, 12)
                    : [];

                console.warn(
                  '[ASTRA_PROVIDER_DIAG] unrecognized_sse_event',
                  JSON.stringify({
                    eventType:
                      typeof parsedRecord['type'] === 'string' ? parsedRecord['type'] : null,
                    topLevelKeys: Object.keys(parsedRecord).slice(0, 12),
                    choiceKeys:
                      choice && typeof choice === 'object' ? Object.keys(choice) : [],
                    responseKeys,
                  }),
                );
              }
            }

            if (!choice) continue;
            if (choice?.finish_reason) lastFinishReason = choice.finish_reason;
            const incomingToolCalls = choice?.delta?.tool_calls ?? [];
            if (incomingToolCalls.length > 0) {
              receivedToolCallDeltas += incomingToolCalls.length;
              console.info('[ASTRA_PROVIDER_DIAG] tool_call_delta', JSON.stringify(
                incomingToolCalls.map(call => ({
                  index: call.index ?? null,
                  id: call.id ?? null,
                  nameFragment: call.function?.name ?? null,
                  argumentFragmentLength: call.function?.arguments?.length ?? 0,
                }))
              ));
            }
            const text = choice?.delta?.content;
            const delta = choice?.delta as { reasoning_content?: string } | undefined;
            const reasoning = delta?.reasoning_content;
            
            if (text) {
              yield { type: 'token', text };
            } else if (reasoning) {
              // Yield reasoning as a separate event so it doesn't pollute the final answer
              yield { type: 'reasoning', text: reasoning };
            }
            for (const [position, call] of (choice?.delta?.tool_calls ?? []).entries()) {
              const index = call.index ?? position;
              let state = streamedToolCalls.get(index);
              if (!state) {
                state = { id: call.id ?? `call_${index}`, name: '', arguments: '' };
                streamedToolCalls.set(index, state);
              }
              if (call.id) state.id = call.id;
              if (call.function?.name) state.name += call.function.name;
              state.arguments += call.function?.arguments ?? '';
            }
            if (choice?.finish_reason) yield { type: 'done', finishReason: choice.finish_reason, ...(parsed.usage ? { usage: parsed.usage } : {}) };
          } catch (error) {
            invalidSseJsonRecords += 1;
            if (invalidSseJsonRecords <= 3) {
              console.warn(
                '[ASTRA_PROVIDER_DIAG] invalid_sse_json',
                JSON.stringify({
                  message: error instanceof Error ? error.message : String(error),
                }),
              );
            }
            yield { type: 'error', error: { message: 'Invalid provider stream event', retryable: false } };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.info('[ASTRA_PROVIDER_DIAG] stream_finished', JSON.stringify({
      finishReason: lastFinishReason,
      receivedSseLines,
      receivedDataLines,
      parsedSseDataRecords,
      invalidSseJsonRecords,
      unrecognizedSseEvents,
      receivedToolCallDeltas,
      completedToolCalls: [...streamedToolCalls.values()].map(call => ({
        id: call.id,
        name: call.name,
        argumentLength: call.arguments.length,
      })),
    }));

    // Emit each completed tool call once, after its final ID and all deltas are known.
    for (const state of streamedToolCalls.values()) {
      if (!state.name) {
        yield {
          type: 'error',
          error: { message: 'Provider streamed a tool call without a function name', retryable: false },
        };
        continue;
      }
      yield {
        type: 'tool_call',
        toolCall: { id: state.id, name: resolveInternalToolName(state.name), arguments: state.arguments },
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    return Boolean(this.config.apiKey);
  }
}

const INSPECT_TRIGGERS = ['inspect', 'structure', 'struktur', 'inspeksi', 'periksa', '结构', '检查'];

class MockProvider implements ModelProvider {
  readonly id = 'mock';
  readonly name = 'Mock Provider';
  readonly capabilities = { toolCalling: false, structuredOutput: false, multimodal: false, maxContextTokens: 8192, maxOutputTokens: 2048 } as const;
  constructor(private readonly modelId: string) {}
  async countTokens(messages: Message[]): Promise<number> { return messages.reduce((n, message) => n + Math.ceil(textContentOf(message).length / 4), 0); }
  async completeChat(request: ChatRequest): Promise<ChatResponse> {
    let content = '';
    for await (const event of this.streamChat(request)) content += event.text ?? '';
    return { content, providerId: this.id, modelId: this.modelId };
  }
  async *streamChat(request: ChatRequest): AsyncIterable<ChatEvent> {
    const latest = request.messages[request.messages.length - 1];
    const prompt = latest ? textContentOf(latest).toLowerCase() : '';
    const inventory = request.messages.find(message => textContentOf(message).startsWith('Workspace inventory'));
    const isInspect = INSPECT_TRIGGERS.some(trigger => prompt.includes(trigger));
    const text = isInspect
      ? `I inspected the workspace context available to Astra. ${inventory ? 'The project inventory was loaded into this task.' : 'No inventory was available for this task.'}\n\nNext step: configure ASTRA_API_KEY to let Astra use live model reasoning and tools. In mock mode, writes and external model calls remain disabled.`
      : `Astra is running in local demo mode. I can inspect this workspace once a live model is configured. Set ASTRA_API_KEY, restart the API, then ask me to inspect files, trace code, implement a focused change, and run verification.`;
    for (const token of text.split(/(\s+)/)) yield { type: 'token', text: token };
    yield { type: 'done', finishReason: 'stop' };
  }
  async healthCheck(): Promise<boolean> { return true; }
}
