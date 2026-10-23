import { describe, expect, it } from 'vitest';
import {
  applyPersonality,
  companionStateFromAgentEvent,
  companionStateFromTaskState,
  DEFAULT_PERSONALITY,
  detailForState,
  isActiveCompanionState,
  COMPANION_STATES,
} from './state.js';
import { COMPANION_ASSETS, MISSING_ASSET_GUIDANCE } from './assets.js';
import {
  companionDayPart,
  companionGreeting,
  companionReaction,
  companionSuggestions,
  isCompanionAddress,
  stripCompanionAddress,
  companionTone,
  companionReactionLine,
  companionObservationLine,
} from './behaviour.js';
import {
  emptyCompanionMemory,
  extractMemoryCandidate,
  forget,
  forgetAll,
  formatMemories,
  parseCompanionMemory,
  remember,
  relevantMemories,
} from './memory.js';
import {
  companionAddressStyle,
  companionBondLine,
  companionBondSummary,
  emptyCompanionBond,
  parseCompanionBond,
  recordInteraction,
} from './bond.js';
import {
  applyVoice,
  cleanCompanionLines,
  companionVoiceProfile,
  pickLine,
  COMPANION_VOICES,
} from './voice.js';
import {
  addRoutine,
  companionReview,
  completeRoutine,
  detectRoutine,
  emptyCompanionRoutines,
  openRoutines,
  parseCompanionRoutines,
  removeRoutine,
} from './routines.js';
import {
  activeGoal,
  advanceGoal,
  companionGoalLine,
  emptyCompanionGoals,
  finishGoal,
  parseCompanionGoals,
  parseGoalCommand,
  startGoal,
} from './goals.js';
import {
  companionAttention,
  recordOutcome,
  startAttentionTracker,
  attentionNeedsBadge,
} from './attention.js';

describe('companion state mapping', () => {
  it('maps every agent task state onto a companion state', () => {
    expect(companionStateFromTaskState('understanding')).toBe('thinking');
    expect(companionStateFromTaskState('planning')).toBe('planning');
    expect(companionStateFromTaskState('executing')).toBe('using_tool');
    expect(companionStateFromTaskState('verifying')).toBe('thinking');
    expect(companionStateFromTaskState('completed')).toBe('success');
    expect(companionStateFromTaskState('failed')).toBe('error');
    expect(companionStateFromTaskState('cancelled')).toBe('cancelled');
    expect(companionStateFromTaskState('idle')).toBe('idle');
  });

  it('produces a companion transition for every relevant agent event', () => {
    expect(companionStateFromAgentEvent({ type: 'state', task: { state: 'planning' } })?.state).toBe('planning');
    expect(companionStateFromAgentEvent({ type: 'text', text: 'hello' })?.state).toBe('speaking');
    expect(companionStateFromAgentEvent({ type: 'tool_start', tool: 'code.read' })?.state).toBe('using_tool');
    expect(companionStateFromAgentEvent({ type: 'tool_result', tool: 'code.read' })?.state).toBe('thinking');
    expect(companionStateFromAgentEvent({ type: 'error', error: 'boom' })?.state).toBe('error');
    expect(companionStateFromAgentEvent({ type: 'done' })?.state).toBe('success');
  });

  it('ignores events that carry no companion meaning', () => {
    expect(companionStateFromAgentEvent({ type: 'unknown' })).toBeUndefined();
  });

  it('reports the tool name while a tool runs', () => {
    const transition = companionStateFromAgentEvent({ type: 'tool_start', tool: 'shell.run' });
    expect(transition?.tool).toBe('shell.run');
    expect(transition?.detail).toBe('Running shell.run');
  });

  it('marks working states as active', () => {
    expect(isActiveCompanionState('using_tool')).toBe(true);
    expect(isActiveCompanionState('success')).toBe(false);
  });

  it('provides a detail string for every companion state', () => {
    for (const state of COMPANION_STATES) {
      expect(detailForState(state).length).toBeGreaterThan(0);
    }
  });
});

describe('personality layer', () => {
  it('leaves the technical text untouched when disabled', () => {
    const text = 'The build failed on line 42.';
    expect(applyPersonality(text, 'error', DEFAULT_PERSONALITY)).toBe(text);
  });

  it('prepends a character line when enabled', () => {
    const personality = { ...DEFAULT_PERSONALITY, enabled: true };
    const result = applyPersonality('The build failed.', 'error', personality);
    expect(result).not.toBe('The build failed.');
    expect(result).toContain('The build failed.');
  });
});

describe('asset manifest', () => {
  it('marks every character asset as proprietary', () => {
    for (const asset of COMPANION_ASSETS) {
      expect(asset.proprietary).toBe(true);
    }
  });

  it('documents where to place missing artwork', () => {
    expect(MISSING_ASSET_GUIDANCE).toContain('assets/companion/aemeath');
    expect(MISSING_ASSET_GUIDANCE).toContain('not bundled');
  });
});

describe('companion behaviour', () => {
  it('picks a greeting that matches the time of day', () => {
    expect(companionDayPart(3)).toBe('night');
    expect(companionDayPart(8)).toBe('morning');
    expect(companionDayPart(13)).toBe('afternoon');
    expect(companionDayPart(19)).toBe('evening');
    expect(companionGreeting(13).mood).toBe('gembira');
    expect(companionGreeting(3).mood).toBe('tenang');
  });

  it('reacts to what the user did', () => {
    expect(companionReaction('greet').mood).toBe('gembira');
    expect(companionReaction('thanks').mood).toBe('gembira');
    expect(companionReaction('error').mood).toBe('fokus');
  });

  it('offers contextual suggestions', () => {
    const noWorkspace = companionSuggestions({ hasWorkspace: false, hasChats: false, isError: false, isIdle: true });
    expect(noWorkspace.length).toBeGreaterThan(0);
    const error = companionSuggestions({ hasWorkspace: true, hasChats: true, isError: true, isIdle: false });
    expect(error[0]?.label).toContain('debug');
    const ready = companionSuggestions({ hasWorkspace: true, hasChats: true, isError: false, isIdle: true });
    expect(ready.length).toBeGreaterThan(0);
  });

  it('detects and strips a direct address', () => {
    expect(isCompanionAddress('@aemeath apa kabar?')).toBe(true);
    expect(isCompanionAddress('aemeath, tolong cek')).toBe(true);
    expect(isCompanionAddress('tolong cek kode')).toBe(false);
    expect(stripCompanionAddress('@aemeath apa kabar?')).toBe('apa kabar?');
  });
});

describe('companion memory', () => {
  it('parses corrupted storage as empty', () => {
    expect(parseCompanionMemory('not json').entries).toEqual([]);
    expect(parseCompanionMemory(null).entries).toEqual([]);
    expect(parseCompanionMemory(JSON.stringify({ version: 2, entries: [] })).entries).toEqual([]);
  });

  it('remembers notes without duplicating them', () => {
    let memory = emptyCompanionMemory();
    memory = remember(memory, 'User likes TypeScript', 'preference');
    memory = remember(memory, 'User likes TypeScript', 'preference');
    expect(memory.entries).toHaveLength(1);
    memory = remember(memory, 'User is working on Astra', 'project');
    expect(memory.entries).toHaveLength(2);
  });

  it('forgets entries and clears everything', () => {
    let memory = emptyCompanionMemory();
    memory = remember(memory, 'a note');
    const id = memory.entries[0]?.id ?? '';
    expect(forget(memory, id).entries).toHaveLength(0);
    expect(forgetAll().entries).toHaveLength(0);
  });

  it('extracts durable statements only', () => {
    expect(extractMemoryCandidate('aku suka TypeScript')?.source).toBe('preference');
    expect(extractMemoryCandidate('aku sedang bikin companion')?.source).toBe('project');
    expect(extractMemoryCandidate('namaku Budi')?.source).toBe('preference');
    expect(extractMemoryCandidate('ok')).toBeUndefined();
  });

  it('ranks relevant memories first', () => {
    let memory = emptyCompanionMemory();
    memory = remember(memory, 'User likes Rust');
    memory = remember(memory, 'User is working on the Astra companion');
    const relevant = relevantMemories(memory, 'help me with the companion');
    expect(relevant[0]).toContain('companion');
    expect(formatMemories(relevant)).toContain('- User');
    expect(formatMemories([])).toBe('');
  });
});


describe('companion tone', () => {
  it('detects what the user is doing', () => {
    expect(companionTone('halo astra')).toBe('greeting');
    expect(companionTone('tolong bantu cek')).toBe('help');
    expect(companionTone('mantap keren')).toBe('praise');
    expect(companionTone('ada error nih')).toBe('sad');
    expect(companionTone('apa kabar?')).toBe('question');
    expect(companionTone('oke')).toBe('neutral');
  });

  it('has a reaction line for most tones', () => {
    expect(companionReactionLine('greeting')).toBeTruthy();
    expect(companionReactionLine('help')).toBeTruthy();
    expect(companionReactionLine('neutral')).toBeUndefined();
  });
});


describe('companion observation', () => {
  it('remarks only about real agent activity', () => {
    expect(companionObservationLine({ tool: 'code.read' })).toContain('project');
    expect(companionObservationLine({ tool: 'shell.run' })).toContain('perintah');
    expect(companionObservationLine({ failed: true })).toContain('error');
    expect(companionObservationLine({ done: true })).toBeTruthy();
    expect(companionObservationLine({})).toBeUndefined();
  });
});


describe('companion bond', () => {
  it('starts empty and survives corrupted storage', () => {
    expect(emptyCompanionBond().familiarity).toBe(0);
    expect(parseCompanionBond('broken').conversations).toBe(0);
    expect(parseCompanionBond(null).familiarity).toBe(0);
  });

  it('grows as the user talks to her', () => {
    let bond = emptyCompanionBond();
    bond = recordInteraction(bond, { message: true, newConversation: true });
    expect(bond.conversations).toBe(1);
    expect(bond.messages).toBe(1);
    expect(bond.familiarity).toBeGreaterThan(0);
    bond = recordInteraction(bond, { message: true });
    expect(bond.messages).toBe(2);
    expect(bond.conversations).toBe(1);
  });

  it('becomes warmer over time', () => {
    let bond = emptyCompanionBond();
    expect(companionAddressStyle(bond)).toBe('casual');
    for (let index = 0; index < 5; index += 1) bond = recordInteraction(bond, { message: true, newConversation: true });
    expect(companionAddressStyle(bond)).toBe('friendly');
    for (let index = 0; index < 20; index += 1) bond = recordInteraction(bond, { message: true, newConversation: true });
    expect(companionAddressStyle(bond)).toBe('close');
    expect(companionBondLine(bond)).toBeTruthy();
    expect(companionBondSummary(bond)).toContain('percakapan');
  });
});


describe('companion voice', () => {
  it('offers several voice presets', () => {
    expect(COMPANION_VOICES.length).toBeGreaterThan(2);
    expect(companionVoiceProfile('tenang').id).toBe('tenang');
    expect(companionVoiceProfile('tenang').endings.length).toBeGreaterThan(0);
  });

  it('adds a natural ending without changing the meaning', () => {
    const result = applyVoice('Aku sudah cek hasilnya', 'gembira', 0);
    expect(result).toContain('Aku sudah cek hasilnya');
    expect(result).not.toBe('Aku sudah cek hasilnya');
  });

  it('keeps an existing ending', () => {
    expect(applyVoice('Sudah beres!', 'gembira', 0)).toBe('Sudah beres!');
  });

  it('drops stiff words', () => {
    expect(applyVoice('Furthermore, this works', 'tenang', 0)).not.toContain('Furthermore');
  });

  it('does not repeat the previous line', () => {
    const pool = ['one', 'two'];
    expect(pickLine(pool, 'one', 0)).toBe('two');
    expect(pickLine([], undefined, 0)).toBe('');
  });

  it('cleans accidental markers from the shipped lines', () => {
    const cleaned = cleanCompanionLines(['Akuofo standby~', 'akulihat detailnya']);
    expect(cleaned[0]).toBe('Aku standby~');
    expect(cleaned[1]).toBe('aku lihat detailnya');
  });
});


describe('companion routines and review', () => {
  it('survives corrupted storage', () => {
    expect(parseCompanionRoutines('broken').items).toEqual([]);
    expect(parseCompanionRoutines(null).items).toEqual([]);
  });

  it('tracks and completes routines', () => {
    let store = emptyCompanionRoutines();
    store = addRoutine(store, { title: 'Perbaiki error', kind: 'followup' });
    expect(openRoutines(store)).toHaveLength(1);
    const id = store.items[0]?.id ?? '';
    store = completeRoutine(store, id);
    expect(openRoutines(store)).toHaveLength(0);
    store = removeRoutine(store, id);
    expect(store.items).toHaveLength(0);
  });

  it('only detects routines from real content', () => {
    expect(detectRoutine('TODO: add tests here')?.kind).toBe('todo');
    expect(detectRoutine('Something failed with an error')?.kind).toBe('followup');
    expect(detectRoutine('all good') ?? undefined).toBeUndefined();
  });

  it('gives an opinionated review only when there is something to say', () => {
    expect(companionReview('There is a TODO left'))?.toContain('TODO');
    expect(companionReview('tests are passing'))?.toBeTruthy();
    expect(companionReview('ok') ?? undefined).toBeUndefined();
  });
});


describe('companion goals', () => {
  it('starts, advances and finishes a goal', () => {
    let store = emptyCompanionGoals();
    store = startGoal(store, 'Refactor the API');
    const id = store.goals[0]?.id ?? '';
    expect(activeGoal(store)?.title).toBe('Refactor the API');
    store = advanceGoal(store, id, 'writing tests', 40);
    expect(activeGoal(store)?.progress).toBe(40);
    expect(activeGoal(store)?.step).toBe('writing tests');
    store = finishGoal(store, id, 'done');
    expect(activeGoal(store)).toBeUndefined();
    expect(store.goals[0]?.progress).toBe(100);
  });

  it('survives corrupted storage', () => {
    expect(parseCompanionGoals('nope').goals).toEqual([]);
    expect(parseCompanionGoals(null).goals).toEqual([]);
  });

  it('describes the goal state', () => {
    let store = emptyCompanionGoals();
    store = startGoal(store, 'Ship the feature');
    const id = store.goals[0]?.id ?? '';
    expect(companionGoalLine(activeGoal(store))).toContain('Ship the feature');
    store = finishGoal(store, id, 'done');
    expect(companionGoalLine(activeGoal(store))).toBeUndefined();
  });

  it('parses a goal command', () => {
    expect(parseGoalCommand('/goal build the thing')).toBe('build the thing');
    expect(parseGoalCommand('hello')).toBeUndefined();
  });
});


describe('companion attention', () => {
  const idle = { consecutiveFailures: 0, repeatedErrors: 0, elapsedMs: 0, idleMs: 0, waitingForInput: false, goalProgressed: true };

  it('stays quiet when everything is fine', () => {
    expect(companionAttention(idle)).toBeUndefined();
    expect(attentionNeedsBadge(undefined)).toBe(false);
  });

  it('speaks up when the agent waits for the user', () => {
    const attention = companionAttention({ ...idle, waitingForInput: true });
    expect(attention?.level).toBe('urgent');
    expect(attentionNeedsBadge(attention)).toBe(true);
  });

  it('notices repeated failures', () => {
    expect(companionAttention({ ...idle, consecutiveFailures: 2 })?.kind).toBe('stuck');
    expect(companionAttention({ ...idle, repeatedErrors: 3 })?.kind).toBe('repeated_failure');
  });

  it('notices a long silence', () => {
    expect(companionAttention({ ...idle, idleMs: 400_000 })?.kind).toBe('idle');
  });

  it('tracks failures and resets on success', () => {
    let tracker = startAttentionTracker();
    tracker = recordOutcome(tracker, 'boom');
    tracker = recordOutcome(tracker, 'boom');
    expect(tracker.consecutiveFailures).toBe(2);
    expect(tracker.repeatedErrors).toBe(2);
    tracker = recordOutcome(tracker);
    expect(tracker.consecutiveFailures).toBe(0);
  });
});
