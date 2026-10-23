/**
 * Shared companion state contract.
 *
 * Both the Web renderer and the CLI renderer consume this module so that the
 * character always reflects the real agent runtime, never a simulation.
 */

/** Discrete states a companion can occupy while the agent works. */
export type CompanionState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'planning'
  | 'speaking'
  | 'using_tool'
  | 'waiting_for_approval'
  | 'success'
  | 'error'
  | 'cancelled';

/** Normalised companion payload shared by every renderer. */
export interface CompanionStateSnapshot {
  state: CompanionState;
  /** Short human readable status, e.g. "Running tests". */
  detail?: string;
  /** Tool currently being executed, when applicable. */
  tool?: string;
  /** Text the character is speaking, when applicable. */
  speech?: string;
  /** Timestamp of the transition. */
  updatedAt: number;
}

export const COMPANION_STATES: readonly CompanionState[] = [
  'idle',
  'listening',
  'thinking',
  'planning',
  'speaking',
  'using_tool',
  'waiting_for_approval',
  'success',
  'error',
  'cancelled',
] as const;

/** States that imply the agent is actively working. */
export const ACTIVE_COMPANION_STATES: readonly CompanionState[] = [
  'listening',
  'thinking',
  'planning',
  'speaking',
  'using_tool',
  'waiting_for_approval',
] as const;

export function isActiveCompanionState(state: CompanionState): boolean {
  return ACTIVE_COMPANION_STATES.includes(state);
}

/**
 * Maps an agent task state onto a companion state.
 * Kept free of any runtime dependency so both frontends can use it directly.
 */
export function companionStateFromTaskState(taskState: string): CompanionState {
  switch (taskState) {
    case 'understanding':
      return 'thinking';
    case 'planning':
      return 'planning';
    case 'executing':
      return 'using_tool';
    case 'verifying':
      return 'thinking';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'idle';
  }
}

/** Idle animation cycles: a small deterministic loop used by both renderers. */
export const COMPANION_IDLE_CYCLE = ['idle', 'thinking', 'idle', 'success'] as const;

/**
 * Chooses the next companion state from a raw agent event.
 * Returns `undefined` when the event carries no companion-relevant change.
 */
export function companionStateFromAgentEvent(event: {
  type: string;
  task?: { state: string };
  tool?: string;
  error?: string;
  text?: string;
}): { state: CompanionState; detail?: string; tool?: string; speech?: string } | undefined {
  switch (event.type) {
    case 'state': {
      const mapped = companionStateFromTaskState(event.task?.state ?? 'idle');
      return { state: mapped, detail: detailForState(mapped) };
    }
    case 'text':
      return event.text ? { state: 'speaking', speech: event.text } : { state: 'speaking' };
    case 'tool_start':
      return { state: 'using_tool', ...(event.tool ? { tool: event.tool } : {}), detail: event.tool ? `Running ${event.tool}` : 'Working' };
    case 'tool_result':
      return { state: 'thinking', detail: event.tool ? `Finished ${event.tool}` : 'Thinking' };
    case 'error':
      return { state: 'error', ...(event.error ? { detail: event.error } : { detail: 'Something went wrong' }) };
    case 'done':
      return { state: 'success', detail: 'Done' };
    default:
      return undefined;
  }
}

export function detailForState(state: CompanionState): string {
  switch (state) {
    case 'idle':
      return 'Ready';
    case 'listening':
      return 'Listening';
    case 'thinking':
      return 'Thinking';
    case 'planning':
      return 'Planning';
    case 'speaking':
      return 'Speaking';
    case 'using_tool':
      return 'Working';
    case 'waiting_for_approval':
      return 'Needs your approval';
    case 'success':
      return 'All done';
    case 'error':
      return 'Something went wrong';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Ready';
  }
}

/** Optional character personality layer. Off by default so engineering output stays clean. */
export interface CompanionPersonality {
  enabled: boolean;
  /** Prefix applied to the character greeting. */
  greeting: string;
  /** Phrases used when a task succeeds. */
  successLines: readonly string[];
  /** Phrases used when a task fails. */
  errorLines: readonly string[];
  /** Phrases used while the agent works. */
  workingLines: readonly string[];
}

export const DEFAULT_PERSONALITY: CompanionPersonality = {
  enabled: false,
  greeting: 'Hai~ aku Aemeath, siap bantu kamu!',
  successLines: ['Yatta! Selesai~', 'Berhasil! Kamu hebat!', 'Ayo, lanjut!'],
  errorLines: ['Hmm, ada yang error... aku cek lagi ya.', 'Ups! Ada masalah. Aku bantu telusuri.'],
  workingLines: ['Aku kerjakan ya~', 'Hmm, aku pikirkan sebentar...', 'Tunggu ya, aku cek dulu!'],
};

/**
 * Applies the personality layer to a technical message.
 * When disabled the original text is returned untouched, so engineering
 * correctness is never sacrificed for roleplay.
 */
export function applyPersonality(text: string, state: CompanionState, personality: CompanionPersonality): string {
  if (!personality.enabled) return text;
  const lines =
    state === 'success'
      ? personality.successLines
      : state === 'error'
        ? personality.errorLines
        : personality.workingLines;
  if (!lines.length) return text;
  const line = lines[Math.floor(Math.random() * lines.length)];
  return line ? `${line}\n\n${text}` : text;
}
