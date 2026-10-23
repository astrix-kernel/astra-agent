/**
 * Lightweight persistent memory for the companion.
 *
 * Aemeath stays with you between sessions, so she should remember the things
 * you told her: how you like to work, what you are building, small preferences.
 * Memory stays on the machine, is plain JSON, and is never sent anywhere
 * except to the model that answers you.
 */

export interface CompanionMemoryEntry {
  id: string;
  /** What she remembered, in her own words. */
  note: string;
  /** Where it came from. */
  source: 'conversation' | 'preference' | 'project';
  createdAt: number;
}

export interface CompanionMemory {
  version: 1;
  entries: CompanionMemoryEntry[];
  updatedAt: number;
}

export const COMPANION_MEMORY_LIMIT = 40;

export function emptyCompanionMemory(): CompanionMemory {
  return { version: 1, entries: [], updatedAt: Date.now() };
}

/** Parses stored memory, falling back to an empty store on any corruption. */
export function parseCompanionMemory(raw: string | null | undefined): CompanionMemory {
  if (!raw) return emptyCompanionMemory();
  try {
    const parsed = JSON.parse(raw) as Partial<CompanionMemory>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyCompanionMemory();
    const entries = parsed.entries.filter(
      (entry): entry is CompanionMemoryEntry =>
        Boolean(entry) && typeof entry.id === 'string' && typeof entry.note === 'string' && typeof entry.createdAt === 'number',
    );
    return { version: 1, entries: entries.slice(-COMPANION_MEMORY_LIMIT), updatedAt: parsed.updatedAt ?? Date.now() };
  } catch {
    return emptyCompanionMemory();
  }
}

/** Adds a note, replacing an older note with the same text. */
export function remember(memory: CompanionMemory, note: string, source: CompanionMemoryEntry['source'] = 'conversation'): CompanionMemory {
  const trimmed = note.trim();
  if (!trimmed) return memory;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: CompanionMemoryEntry = { id, note: trimmed, source, createdAt: Date.now() };
  const withoutDuplicate = memory.entries.filter(item => item.note.toLowerCase() !== trimmed.toLowerCase());
  return {
    version: 1,
    entries: [...withoutDuplicate, entry].slice(-COMPANION_MEMORY_LIMIT),
    updatedAt: Date.now(),
  };
}

/** Forgets one entry by id. */
export function forget(memory: CompanionMemory, id: string): CompanionMemory {
  return { version: 1, entries: memory.entries.filter(entry => entry.id !== id), updatedAt: Date.now() };
}

/** Clears everything she remembers. */
export function forgetAll(): CompanionMemory {
  return emptyCompanionMemory();
}

/**
 * Picks the notes most relevant to the current message so the prompt stays
 * small even when she knows a lot.
 */
export function relevantMemories(memory: CompanionMemory, message: string, limit = 8): string[] {
  if (!memory.entries.length) return [];
  const words = new Set(
    message
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length > 3),
  );
  const scored = memory.entries
    .map(entry => {
      const haystack = entry.note.toLowerCase();
      const overlap = [...words].filter(word => haystack.includes(word)).length;
      return { entry, score: overlap };
    })
    .sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt);
  return scored.slice(0, limit).map(item => item.entry.note);
}

/** Formats memories for inclusion in a model prompt. */
export function formatMemories(notes: readonly string[]): string {
  if (!notes.length) return '';
  return `\n\nWhat you remember about the user:\n${notes.map(note => `- ${note}`).join('\n')}`;
}

/**
 * Extracts a memory candidate from a user message. Only clear, durable
 * statements are kept so the memory does not fill up with noise.
 */
export function extractMemoryCandidate(message: string): { note: string; source: CompanionMemoryEntry['source'] } | undefined {
  const text = message.trim();
  if (!text || text.length > 400) return undefined;
  const preference = text.match(/\b(?:aku|saya|gwe)\s+(?:suka|lebih suka|prefer|love|biasanya|selalu|selalu pakai|usually)\s+(.{3,120})/i);
  if (preference?.[1]) return { note: `User ${preference[0].replace(/^\w+\s+/i, '').trim()}`, source: 'preference' };
  const project = text.match(/\b(?:aku|saya)\s+(?:sedang| lagi)?\s*(?:bikin|buat|membangun|develop|mengerjakan|kerja di)\s+(.{3,120})/i);
  if (project?.[1]) return { note: `User is working on: ${project[1].trim()}`, source: 'project' };
  const named = text.match(/\b(?:namaku|nama saya|my name is|call me)\s+([A-Za-z][\w '-]{1,40})/i);
  if (named?.[1]) return { note: `User's name is ${named[1].trim()}`, source: 'preference' };
  return undefined;
}
