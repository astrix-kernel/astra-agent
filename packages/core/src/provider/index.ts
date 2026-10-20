import type { ChatEvent, ChatRequest, ChatResponse, ProviderError } from '../types/chat.js';
import type { Message} from '../types/messages.js';
import { textContentOf } from '../types/messages.js';

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
      if (event.type === 'token') content += event.text ?? '';
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
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.modelId ?? this.config.modelId,
        messages: request.messages,
        tools: request.tools,
        tool_choice: request.toolChoice,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (!response.ok || !response.body) {
      const message = await response.text().catch(() => 'Provider request failed');
      const error: ProviderError = { message, status: response.status, retryable: response.status >= 500 || response.status === 429 };
      yield { type: 'error', error };
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const data = line.replace(/^data:\s*/, '').trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[]; usage?: ChatResponse['usage'] };
            const choice = parsed.choices?.[0];
            const text = choice?.delta?.content;
            if (text) yield { type: 'token', text };
            for (const call of choice?.delta?.tool_calls ?? []) {
              if (call.function?.name) yield { type: 'tool_call_delta', toolCall: { id: call.id ?? `call_${call.function.name}`, name: call.function.name, arguments: call.function.arguments ?? '' } };
            }
            if (choice?.finish_reason) yield { type: 'done', finishReason: choice.finish_reason, ...(parsed.usage ? { usage: parsed.usage } : {}) };
          } catch {
            yield { type: 'error', error: { message: 'Invalid provider stream event', retryable: false } };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async healthCheck(): Promise<boolean> {
    return Boolean(this.config.apiKey);
  }
}

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
    const text = prompt.includes('inspect') || prompt.includes('structure')
      ? `I inspected the workspace context available to Astra. ${inventory ? 'The project inventory was loaded into this task.' : 'No inventory was available for this task.'}\n\nNext step: configure ASTRA_API_KEY to let Astra use live model reasoning and tools. In mock mode, writes and external model calls remain disabled.`
      : `Astra is running in local demo mode. I can inspect this workspace once a live model is configured. Set ASTRA_API_KEY, restart the API, then ask me to inspect files, trace code, implement a focused change, and run verification.`;
    for (const token of text.split(/(\s+)/)) yield { type: 'token', text: token };
    yield { type: 'done', finishReason: 'stop' };
  }
  async healthCheck(): Promise<boolean> { return true; }
}
