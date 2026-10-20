"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProvider = createProvider;
const messages_js_1 = require("../types/messages.js");
function createProvider(config) {
    if (config.type === 'mock')
        return new MockProvider(config.modelId ?? 'mock');
    return new OpenAICompatibleProvider(config);
}
class OpenAICompatibleProvider {
    config;
    id = 'openai-compatible';
    name = 'OpenAI Compatible';
    capabilities = {
        toolCalling: true,
        structuredOutput: true,
        multimodal: false,
        maxContextTokens: 128000,
        maxOutputTokens: 16384,
    };
    constructor(config) {
        this.config = config;
    }
    async countTokens(messages) {
        return messages.reduce((total, message) => total + Math.ceil((0, messages_js_1.textContentOf)(message).length / 4), 0);
    }
    async completeChat(request) {
        let content = '';
        const toolCalls = [];
        let usage;
        for await (const event of this.streamChat({ ...request, stream: true })) {
            if (event.type === 'token')
                content += event.text ?? '';
            if (event.type === 'tool_call' && event.toolCall)
                toolCalls.push(event.toolCall);
            if (event.type === 'done')
                usage = event.usage;
            if (event.type === 'error')
                throw new Error(event.error?.message ?? 'Provider error');
        }
        return {
            content,
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
            ...(usage ? { usage } : {}),
            providerId: this.id,
            modelId: request.modelId ?? this.config.modelId ?? 'default',
        };
    }
    async *streamChat(request) {
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
            const error = { message, status: response.status, retryable: response.status >= 500 || response.status === 429 };
            yield { type: 'error', error };
            return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done)
                    break;
                buffer += decoder.decode(chunk.value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const data = line.replace(/^data:\s*/, '').trim();
                    if (!data || data === '[DONE]')
                        continue;
                    try {
                        const parsed = JSON.parse(data);
                        const choice = parsed.choices?.[0];
                        const text = choice?.delta?.content;
                        if (text)
                            yield { type: 'token', text };
                        for (const call of choice?.delta?.tool_calls ?? []) {
                            if (call.function?.name)
                                yield { type: 'tool_call_delta', toolCall: { id: call.id ?? `call_${call.function.name}`, name: call.function.name, arguments: call.function.arguments ?? '' } };
                        }
                        if (choice?.finish_reason)
                            yield { type: 'done', finishReason: choice.finish_reason, ...(parsed.usage ? { usage: parsed.usage } : {}) };
                    }
                    catch {
                        yield { type: 'error', error: { message: 'Invalid provider stream event', retryable: false } };
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    async healthCheck() {
        return Boolean(this.config.apiKey);
    }
}
class MockProvider {
    modelId;
    id = 'mock';
    name = 'Mock Provider';
    capabilities = { toolCalling: false, structuredOutput: false, multimodal: false, maxContextTokens: 8192, maxOutputTokens: 2048 };
    constructor(modelId) {
        this.modelId = modelId;
    }
    async countTokens(messages) { return messages.reduce((n, message) => n + Math.ceil((0, messages_js_1.textContentOf)(message).length / 4), 0); }
    async completeChat(request) {
        let content = '';
        for await (const event of this.streamChat(request))
            content += event.text ?? '';
        return { content, providerId: this.id, modelId: this.modelId };
    }
    async *streamChat(request) {
        const latest = request.messages[request.messages.length - 1];
        const prompt = latest ? (0, messages_js_1.textContentOf)(latest).toLowerCase() : '';
        const inventory = request.messages.find(message => (0, messages_js_1.textContentOf)(message).startsWith('Workspace inventory'));
        const text = prompt.includes('inspect') || prompt.includes('structure')
            ? `I inspected the workspace context available to Astra. ${inventory ? 'The project inventory was loaded into this task.' : 'No inventory was available for this task.'}\n\nNext step: configure ASTRA_API_KEY to let Astra use live model reasoning and tools. In mock mode, writes and external model calls remain disabled.`
            : `Astra is running in local demo mode. I can inspect this workspace once a live model is configured. Set ASTRA_API_KEY, restart the API, then ask me to inspect files, trace code, implement a focused change, and run verification.`;
        for (const token of text.split(/(\s+)/))
            yield { type: 'token', text: token };
        yield { type: 'done', finishReason: 'stop' };
    }
    async healthCheck() { return true; }
}
//# sourceMappingURL=index.js.map