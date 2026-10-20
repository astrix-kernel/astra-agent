import type { Message } from './messages.js';

/** A tool definition exposed to the model. */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  parameters: Record<string, unknown>;
}

export type ToolChoice = 'auto' | 'none' | 'required' | { function: { name: string } };

export interface ChatRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
  signal?: AbortSignal;
  /** Optional provider/model override for this request. */
  providerId?: string;
  modelId?: string;
  metadata?: Record<string, unknown>;
}

/** A single streamed event emitted by a provider. */
export interface ChatEvent {
  type: 'token' | 'tool_call' | 'tool_call_delta' | 'error' | 'done' | 'usage';
  /** Text delta for 'token' events. */
  text?: string;
  /** Partial tool call for 'tool_call' / 'tool_call_delta'. */
  toolCall?: { id: string; name: string; arguments: string };
  /** Accumulated error detail. */
  error?: ProviderError;
  /** Usage/finish info on 'done'. */
  usage?: Usage;
  finishReason?: string;
}

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Estimated USD cost, when computable. */
  estimatedCostUsd?: number;
}

export interface ChatResponse {
  content: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
  usage?: Usage;
  finishReason?: string;
  providerId: string;
  modelId: string;
}

export interface ProviderError {
  message: string;
  code?: string;
  status?: number;
  /** Whether the provider suggests a retry. */
  retryable?: boolean;
  /** Suggested retry delay in ms. */
  retryAfterMs?: number;
}
