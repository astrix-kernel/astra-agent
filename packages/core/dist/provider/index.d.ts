import type { ChatEvent, ChatRequest, ChatResponse } from '../types/chat.js';
import type { Message } from '../types/messages.js';
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
export declare function createProvider(config: ProviderConfig): ModelProvider;
//# sourceMappingURL=index.d.ts.map