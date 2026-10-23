/**
 * Companion routines and review.
 *
 * A personal assistant is useful when she remembers what still needs doing and
 * speaks up when she notices something worth a second look. Both features are
 * driven by real agent output, never by invented progress.
 */

export interface CompanionRoutine {
  id: string;
  /** What needs attention, in the companion's own words. */
  title: string;
  /** Optional detail such as the file or tool involved. */
  detail?: string;
  /** How urgent it is. */
  kind: 'todo' | 'followup' | 'note';
  createdAt: number;
  done: boolean;
}

export interface CompanionRoutineStore {
  version: 1;
  items: CompanionRoutine[];
  updatedAt: number;
}

export const COMPANION_ROUTINE_LIMIT = 20;

export function emptyCompanionRoutines(): CompanionRoutineStore {
  return { version: 1, items: [], updatedAt: Date.now() };
}

export function parseCompanionRoutines(raw: string | null | undefined): CompanionRoutineStore {
  if (!raw) return emptyCompanionRoutines();
  try {
    const parsed = JSON.parse(raw) as Partial<CompanionRoutineStore>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) return emptyCompanionRoutines();
    const items = parsed.items.filter(
      (item): item is CompanionRoutine =>
        Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.createdAt === 'number',
    );
    return { version: 1, items: items.slice(-COMPANION_ROUTINE_LIMIT), updatedAt: parsed.updatedAt ?? Date.now() };
  } catch {
    return emptyCompanionRoutines();
  }
}

export function addRoutine(store: CompanionRoutineStore, routine: Omit<CompanionRoutine, 'id' | 'createdAt' | 'done'>): CompanionRoutineStore {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item: CompanionRoutine = { ...routine, id, createdAt: Date.now(), done: false };
  const withoutDuplicate = store.items.filter(existing => existing.title.toLowerCase() !== item.title.toLowerCase());
  return { version: 1, items: [...withoutDuplicate, item].slice(-COMPANION_ROUTINE_LIMIT), updatedAt: Date.now() };
}

export function completeRoutine(store: CompanionRoutineStore, id: string): CompanionRoutineStore {
  return { version: 1, items: store.items.map(item => (item.id === id ? { ...item, done: true } : item)), updatedAt: Date.now() };
}

export function removeRoutine(store: CompanionRoutineStore, id: string): CompanionRoutineStore {
  return { version: 1, items: store.items.filter(item => item.id !== id), updatedAt: Date.now() };
}

export function openRoutines(store: CompanionRoutineStore): CompanionRoutine[] {
  return store.items.filter(item => !item.done);
}

/**
 * Notices something worth a routine by looking at the real agent output.
 * Returns undefined when nothing stands out, so she never invents chores.
 */
export function detectRoutine(text: string): { title: string; kind: CompanionRoutine['kind']; detail?: string } | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const todo = trimmed.match(/\b(TODO|FIXME|XXX|HACK)\b[:\s]*(.{3,80})/i);
  if (todo?.[1] && todo[2]) return { title: `Ada ${todo[1].toUpperCase()} yang perlu Dicek`, kind: 'todo', detail: todo[2].trim() };

  const failure = trimmed.match(/\b(error|failed|exception|traceback|not found|cannot find|undefined is not)\b/i);
  if (failure) return { title: 'Ada yang perlu diperbaiki di hasil tadi', kind: 'followup' };

  const followUp = trimmed.match(/\b(next step|langkah berikutnya|you should|you can then|recommend|s|GEBRUKAN|terus)\b/i);
  if (followUp) return { title: 'Masih ada langkah lanjutan dari hasil tadi', kind: 'followup' };

  const testMention = trimmed.match(/\b(test|tests|lint|build|verify|verification)\b/i);
  if (testMention) return { title: 'Jangan lupa verifikasi lagi setelah perubahan ini', kind: 'note' };

  return undefined;
}

/**
 * A short, opinionated remark about the agent's answer.
 * It reacts to what is actually in the text rather than a generic praise.
 */
export function companionReview(text: string, seed = 0): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  if (/\b(todo|fixme)\b/i.test(trimmed)) {
    const lines = ['Ada TODO yang masih menggantung, mau aku bantu beresin?', 'Oh, masih ada TODO. Aku catet ya~'];
    return lines[Math.abs(seed) % lines.length];
  }
  if (/\b(error|failed|exception)\b/i.test(trimmed)) {
    const lines = ['Hmm, hasilnya masih ada error. Mau aku telusuri?', 'Ada yang belum beres di situ, perlu dicek lagi~'];
    return lines[Math.abs(seed) % lines.length];
  }
  if (/\b(test|tests|passing|passed|green)\b/i.test(trimmed)) {
    const lines = ['Wah test-nya lolos, bagus!', 'Oke, kelihatan udah bener nih~'];
    return lines[Math.abs(seed) % lines.length];
  }
  if (trimmed.length > 700) {
    const lines = ['Penjelasannya panjang nih, mau aku ringkas?', 'Agak panjang ya, mau aku rangkum?'];
    return lines[Math.abs(seed) % lines.length];
  }
  if (/\b(file|folder|src|lib|packages)\//.test(trimmed)) {
    const lines = ['Oh, ada file yang diubah ya~ Bagus.', 'Wah, kelihatan file-nya udah di-rapihin.'];
    return lines[Math.abs(seed) % lines.length];
  }
  return undefined;
}
