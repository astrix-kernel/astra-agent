/**
 * Attention system for the companion.
 *
 * A personal assistant is valuable when she notices things on her own: a task
 * that keeps failing, a goal that has not moved, or a long silence. Every
 * signal here is derived from real agent activity, so she never interrupts
 * about something that did not happen.
 */

export type CompanionAttentionKind = 'stuck' | 'slow' | 'idle' | 'repeated_failure' | 'needs_input';

export interface CompanionAttention {
  kind: CompanionAttentionKind;
  /** How strongly she should speak up. */
  level: 'soft' | 'normal' | 'urgent';
  /** What she noticed. */
  reason: string;
  /** The line she would say. */
  line: string;
}

export interface CompanionAttentionSignals {
  /** Consecutive failures in the current task. */
  consecutiveFailures: number;
  /** How many times the same error text appeared. */
  repeatedErrors: number;
  /** How long the task has been running, in milliseconds. */
  elapsedMs: number;
  /** How long the user has been silent, in milliseconds. */
  idleMs: number;
  /** Whether the agent is waiting for the user to answer something. */
  waitingForInput: boolean;
  /** Whether the goal has made progress recently. */
  goalProgressed: boolean;
}

/** Thresholds are deliberately generous so she does not become noisy. */
export const ATTENTION_FAILURE_THRESHOLD = 2;
export const ATTENTION_SLOW_TASK_MS = 120_000;
export const ATTENTION_IDLE_MS = 300_000;

/**
 * Works out whether she should speak up, and what she should say.
 * Returns undefined when everything is fine.
 */
export function companionAttention(signals: CompanionAttentionSignals): CompanionAttention | undefined {
  if (signals.waitingForInput) {
    return {
      kind: 'needs_input',
      level: 'urgent',
      reason: 'the agent is waiting for the user',
      line: 'Hei, Astra nunggu kamu~ Ada yang perlu dijawab!',
    };
  }
  if (signals.repeatedErrors >= 3) {
    return {
      kind: 'repeated_failure',
      level: 'urgent',
      reason: 'the same error keeps coming back',
      line: 'Hmm, error yang sama terus muncul. Aku bantuin telusuri yang lain~',
    };
  }
  if (signals.consecutiveFailures >= ATTENTION_FAILURE_THRESHOLD) {
    return {
      kind: 'stuck',
      level: 'normal',
      reason: 'consecutive failures',
      line: 'Hmm, ketahan terus nih. Mau aku coba cara lain?',
    };
  }
  if (signals.elapsedMs >= ATTENTION_SLOW_TASK_MS && !signals.goalProgressed) {
    return {
      kind: 'slow',
      level: 'soft',
      reason: 'the task is taking a while without progress',
      line: 'Agak lama nih kerjanya, masih jalan kok~ Sabar ya!',
    };
  }
  if (signals.idleMs >= ATTENTION_IDLE_MS) {
    return {
      kind: 'idle',
      level: 'soft',
      reason: 'the user has been quiet',
      line: 'Hai~ kamu masih di sana? Aku di sini kok~',
    };
  }
  return undefined;
}

/** Keeps track of failures and repeats while a task runs. */
export interface CompanionAttentionTracker {
  consecutiveFailures: number;
  lastError: string;
  repeatedErrors: number;
  startedAt: number;
}

export function startAttentionTracker(now = Date.now()): CompanionAttentionTracker {
  return { consecutiveFailures: 0, lastError: '', repeatedErrors: 0, startedAt: now };
}

export function recordOutcome(tracker: CompanionAttentionTracker, error?: string): CompanionAttentionTracker {
  if (!error) return { ...tracker, consecutiveFailures: 0, repeatedErrors: 0 };
  const repeatedErrors = error === tracker.lastError ? tracker.repeatedErrors + 1 : 1;
  return { ...tracker, consecutiveFailures: tracker.consecutiveFailures + 1, lastError: error, repeatedErrors };
}

/** Does the attention need a visible marker on the companion? */
export function attentionNeedsBadge(attention: CompanionAttention | undefined): boolean {
  return attention?.level === 'urgent';
}
