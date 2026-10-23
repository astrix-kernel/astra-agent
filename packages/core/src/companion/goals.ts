/**
 * Goal tracking for the companion.
 *
 * A goal is a long-running objective the user hands to Astra. The companion
 * keeps it, shows progress, and narrates what is happening so the goal feels
 * owned rather than announced once and forgotten.
 */

export type CompanionGoalStatus = 'active' | 'blocked' | 'done' | 'cancelled';

export interface CompanionGoal {
  id: string;
  /** The objective, in the user's words. */
  title: string;
  status: CompanionGoalStatus;
  /** Short note about the current step. */
  step?: string;
  /** How far along the goal is, 0 to 100. */
  progress: number;
  createdAt: number;
  updatedAt: number;
}

export interface CompanionGoalStore {
  version: 1;
  goals: CompanionGoal[];
  updatedAt: number;
}

export const COMPANION_GOAL_LIMIT = 20;

export function emptyCompanionGoals(): CompanionGoalStore {
  return { version: 1, goals: [], updatedAt: Date.now() };
}

export function parseCompanionGoals(raw: string | null | undefined): CompanionGoalStore {
  if (!raw) return emptyCompanionGoals();
  try {
    const parsed = JSON.parse(raw) as Partial<CompanionGoalStore>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.goals)) return emptyCompanionGoals();
    const goals = parsed.goals.filter(
      (goal): goal is CompanionGoal =>
        Boolean(goal) && typeof goal.id === 'string' && typeof goal.title === 'string' && typeof goal.createdAt === 'number',
    );
    return { version: 1, goals: goals.slice(-COMPANION_GOAL_LIMIT), updatedAt: parsed.updatedAt ?? Date.now() };
  } catch {
    return emptyCompanionGoals();
  }
}

export function startGoal(store: CompanionGoalStore, title: string): CompanionGoalStore {
  const trimmed = title.trim();
  if (!trimmed) return store;
  const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const goal: CompanionGoal = { id, title: trimmed, status: 'active', progress: 0, createdAt: Date.now(), updatedAt: Date.now() };
  return { version: 1, goals: [...store.goals, goal].slice(-COMPANION_GOAL_LIMIT), updatedAt: Date.now() };
}

export function advanceGoal(store: CompanionGoalStore, id: string, step: string, progress?: number): CompanionGoalStore {
  return {
    version: 1,
    goals: store.goals.map(goal =>
      goal.id === id
        ? { ...goal, step, progress: progress ?? Math.min(95, goal.progress + 12), status: 'active' as const, updatedAt: Date.now() }
        : goal,
    ),
    updatedAt: Date.now(),
  };
}

export function finishGoal(store: CompanionGoalStore, id: string, status: 'done' | 'cancelled' | 'blocked' = 'done'): CompanionGoalStore {
  return {
    version: 1,
    goals: store.goals.map(goal =>
      goal.id === id
        ? { ...goal, status, progress: status === 'done' ? 100 : goal.progress, updatedAt: Date.now() }
        : goal,
    ),
    updatedAt: Date.now(),
  };
}

export function activeGoal(store: CompanionGoalStore): CompanionGoal | undefined {
  return [...store.goals].reverse().find(goal => goal.status === 'active' || goal.status === 'blocked');
}

/** A short line describing where the goal stands right now. */
export function companionGoalLine(goal: CompanionGoal | undefined): string | undefined {
  if (!goal) return undefined;
  if (goal.status === 'done') return 'Goal-nya selesai~ Kamu Hebat!';
  if (goal.status === 'cancelled') return 'Goal-nya dibatalkan ya.';
  if (goal.status === 'blocked') return 'Goal-nya ketahan nih, perlu bantuan kamu.';
  if (goal.step) return `Goal lagi jalan: ${goal.step} (${goal.progress}%)`;
  return `Goal lagi jalan: ${goal.title} (${goal.progress}%)`;
}

/** Detects a goal command written in the chat. */
export function parseGoalCommand(text: string): string | undefined {
  const match = text.match(/^\/goal\s+(.+)$/is);
  return match?.[1]?.trim();
}
