"use strict";
/**
 * Core message types shared across the agent runtime.
 * These are provider-agnostic: providers translate to/from their native formats.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.textContentOf = textContentOf;
exports.createMessage = createMessage;
function textContentOf(message) {
    if (typeof message.content === 'string')
        return message.content;
    return message.content
        .filter((p) => p.type === 'text')
        .map(p => p.text)
        .join('\n');
}
function createMessage(role, content, extra) {
    return { role, content, createdAt: Date.now(), ...extra };
}
//# sourceMappingURL=messages.js.map