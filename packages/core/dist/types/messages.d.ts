/**
 * Core message types shared across the agent runtime.
 * These are provider-agnostic: providers translate to/from their native formats.
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';
export interface TextContentPart {
    type: 'text';
    text: string;
}
export interface ImageContentPart {
    type: 'image';
    /** base64-encoded image data or URL */
    data: string;
    mediaType: string;
}
export type ContentPart = TextContentPart | ImageContentPart;
export interface ToolCall {
    id: string;
    name: string;
    /** Raw JSON arguments as provided by the model (may be incomplete during streaming). */
    arguments: string;
}
export interface Message {
    role: Role;
    content: string | ContentPart[];
    /** Present on assistant messages that request tool execution. */
    toolCalls?: ToolCall[];
    /** Present on tool-role messages referencing a tool call. */
    toolCallId?: string;
    name?: string;
    metadata?: Record<string, unknown>;
    createdAt?: number;
}
export declare function textContentOf(message: Message): string;
export declare function createMessage(role: Role, content: string | ContentPart[], extra?: Partial<Message>): Message;
//# sourceMappingURL=messages.d.ts.map