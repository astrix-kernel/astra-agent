import { useI18n } from './i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CompanionState, CompanionVoice } from '@astra/core/companion';
import { AemeathRig } from './aemeath-rig.js';

export interface CompanionRendererProps {
  state: CompanionState;
  detail?: string | undefined;
  speech?: string | undefined;
  /** Renders the character art. Defaults to the per-state sprite frame. */
  className?: string | undefined;
  /** Use the licensed still artwork instead of the animated vector rig. */
  useArtwork?: boolean | undefined;
  /** Softens decorative motion while keeping the character alive. */
  calm?: boolean | undefined;
}

const ASSET_BASE = '/assets/companion/aemeath';
const STATE_FRAME: Record<CompanionState, string> = {
  idle: 'idle',
  listening: 'listen',
  thinking: 'think',
  planning: 'plan',
  speaking: 'talk',
  using_tool: 'work',
  waiting_for_approval: 'approve',
  success: 'happy',
  error: 'sorry',
  cancelled: 'sorry',
};

export const COMPANION_STATE_LABELS: Record<CompanionState, string> = {
  idle: "Ready",
  listening: 'Listening',
  thinking: 'Thinking',
  planning: 'Planning',
  speaking: 'Speaking',
  using_tool: "Working",
  waiting_for_approval: 'Approval needed',
  success: "Done",
  error: 'Error',
  cancelled: 'Cancelled',
};

/**
 * Renders Aemeath for a given companion state.
 *
 * The vector rig is the default because it is genuinely animated: blinking,
 * gaze tracking, lip sync, hair physics and body language all react to the
 * live agent state. The licensed artwork can be swapped in per frame when the
 * user prefers the original illustration.
 */
export function CompanionCharacter({ state, detail, speech, className, useArtwork = false, calm = false }: CompanionRendererProps) {
  const frame = STATE_FRAME[state];
  const [assetFailed, setAssetFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const src = useMemo(
    () => (expanded ? `${ASSET_BASE}/portrait/aemeath-fullbody.webp` : `${ASSET_BASE}/sprite/aemeath-${frame}.webp`),
    [frame, expanded],
  );

  if (!useArtwork || assetFailed) {
    return (
      <div className={`aemeath-character ${className ?? ''}`}>
        <AemeathRig state={state} detail={detail} speech={speech} size={260} calm={calm} />
      </div>
    );
  }

  return (
    <div className={`aemeath-character ${className ?? ''}`} data-state={state}>
      <div className="aemeath-art-wrap">
        <button
          type="button"
          className="aemeath-art"
          onDoubleClick={() => setExpanded(value => !value)}
          title="Double click to switch body view"
        >
          <img
            src={src}
            alt="Aemeath"
            draggable={false}
            onError={() => setAssetFailed(true)}
            className={expanded ? 'is-fullbody' : 'is-portrait'}
          />
        </button>
      </div>
      <AemeathCaption line={speech} detail={detail} state={state} />
    </div>
  );
}

function AemeathCaption({ line, detail, state }: { line: string | undefined; detail: string | undefined; state: CompanionState }) {
  return (
    <div className="aemeath-caption">
      {line ? (
        <div className="aemeath-bubble" role="status">
          {line}
        </div>
      ) : null}
      <div className="aemeath-status">
        <span className={`aemeath-dot state-${state}`} />
        <span className="aemeath-status-label">{detail ?? COMPANION_STATE_LABELS[state]}</span>
      </div>
    </div>
  );
}

export interface CompanionChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompanionDockProps {
  state: CompanionState;
  detail?: string | undefined;
  speech?: string | undefined;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  reducedMotion: boolean;
  scale: number;
  onScaleChange: (scale: number) => void;
  position: { x: number; y: number; dragged?: boolean };
  onPositionChange: (position: { x: number; y: number; dragged?: boolean }) => void;
  personalityEnabled: boolean;
  onPersonalityChange: (enabled: boolean) => void;
  useArtwork: boolean;
  onUseArtworkChange: (useArtwork: boolean) => void;
  calm: boolean;
  onCalmChange: (calm: boolean) => void;
  /** Recent real agent activity, newest first. */
  activity?: readonly string[] | undefined;
  /** Live status line shown while the agent works. */
  liveStatus?: string | undefined;
  /** Controlled chat panel visibility. */
  chatOpen?: boolean | undefined;
  onChatOpenChange?: ((open: boolean) => void) | undefined;
  /** True when the main sidebar is collapsed. */
  sidebarCollapsed?: boolean | undefined;
  /** Casual chat, or focused on the project. */
  chatMode?: 'casual' | 'project' | undefined;
  onChatModeChange?: ((mode: 'casual' | 'project') => void) | undefined;
  /** Sends a message to the companion and returns its reply. */
  onAsk?: ((message: string, history: CompanionChatTurn[]) => Promise<string>) | undefined;
  /** Sends a prompt into the main conversation composer. */
  onDelegate?: ((prompt: string) => void) | undefined;
  /** Runs a read-only tool on the user's behalf and returns its output. */
  onRunTool?: ((tool: string, input: Record<string, unknown>) => Promise<unknown>) | undefined;
  /** Contextual suggestions the companion proposes right now. */
  suggestions?: readonly { label: string; prompt: string }[] | undefined;
  /** Notes the companion remembers about the user. */
  memories?: readonly { id: string; note: string }[] | undefined;
  onForgetMemory?: ((id: string) => void) | undefined;
  onForgetAllMemories?: (() => void) | undefined;
  /** Short summary of how well she knows the user. */
  bondSummary?: string | undefined;
  /** Familiarity level, 0-100. */
  familiarity?: number | undefined;
  /** Currently selected voice preset. */
  voice?: CompanionVoice | undefined;
  voices?: readonly { id: CompanionVoice; label: string }[] | undefined;
  onVoiceChange?: ((voice: CompanionVoice) => void) | undefined;
  /** Things the companion noticed that still need attention. */
  routines?: readonly { id: string; title: string; detail?: string; kind: string }[] | undefined;
  onCompleteRoutine?: ((id: string) => void) | undefined;
  onRemoveRoutine?: ((id: string) => void) | undefined;
  /** The goal the companion is currently working on. */
  goal?: { title: string; status: string; progress: number; step?: string } | undefined;
  /** How strongly she needs the user's attention right now. */
  attentionLevel?: 'none' | 'soft' | 'normal' | 'urgent' | undefined;
}

/**
 * Floating companion dock. Draggable by the header, resizable via the corner
 * handle, minimizable and hideable. It never blocks the composer because the
 * dock is positioned inside the workspace area and stays above the fold.
 */
export function CompanionDock({
  state,
  detail,
  speech,
  visible,
  onVisibleChange,
  reducedMotion,
  scale,
  onScaleChange,
  position,
  onPositionChange,
  personalityEnabled,
  onPersonalityChange,
  useArtwork,
  onUseArtworkChange,
  calm,
  onCalmChange,
  activity,
  liveStatus,
  chatOpen: controlledChatOpen,
  onChatOpenChange,
  onAsk,
  onDelegate,
  onRunTool,
  sidebarCollapsed,
  chatMode,
  onChatModeChange,
  suggestions,
  memories,
  onForgetMemory,
  onForgetAllMemories,
  bondSummary,
  familiarity,
  voice,
  voices,
  onVoiceChange,
  routines,
  onCompleteRoutine,
  onRemoveRoutine,
  goal,
  attentionLevel,
}: CompanionDockProps) {
  const { t } = useI18n();
  const [isCompact, setIsCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  const [minimized, setMinimized] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  const [localChatOpen, setLocalChatOpen] = useState(true);
  const chatOpen = controlledChatOpen ?? localChatOpen;
  const setChatOpen = (open: boolean) => {
    setLocalChatOpen(open);
    // Opening the chat always reveals the panel, even when the dock was minimised.
    if (open) setMinimized(false);
    onChatOpenChange?.(open);
  };

  // The header toggle drives the dock on compact screens.
  useEffect(() => {
    if (!isCompact) return;
    if (controlledChatOpen && minimized) setMinimized(false);
  }, [controlledChatOpen, isCompact, minimized]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLog, setChatLog] = useState<CompanionChatTurn[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);

  const askCompanion = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy || !onAsk) return;
    const nextHistory = [...chatLog, { role: 'user' as const, content: text }];
    setChatLog(nextHistory);
    setChatInput('');
    setChatBusy(true);
    try {
      const reply = await onAsk(text, nextHistory);
      setChatLog(current => [...current, { role: 'assistant', content: reply }]);
    } catch (error) {
      setChatLog(current => [...current, { role: 'assistant', content: error instanceof Error ? error.message : 'Sorry, I could not answer that.' }]);
    } finally {
      setChatBusy(false);
    }
  };

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest('button')) return;
      const rect = event.currentTarget.parentElement?.getBoundingClientRect();
      if (!rect) return;
      dragRef.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [position.x, position.y],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const sidebarEdge = sidebarCollapsed ? 24 : 300;
      const composer = document.querySelector('.composer-wrap')?.getBoundingClientRect();
      const composerRight = composer ? composer.right + 16 : window.innerWidth;
      const minX = Math.max(sidebarEdge, composerRight);
      const nextX = Math.max(minX, Math.min(window.innerWidth - 304, event.clientX - dragRef.current.offsetX));
      const nextY = Math.max(8, Math.min(window.innerHeight - 150, event.clientY - dragRef.current.offsetY));
      onPositionChange({ x: nextX, y: nextY, dragged: true });
    },
    [onPositionChange],
  );

  // Clamp the scale so the dock always fits the viewport.
  useEffect(() => {
    const element = dockRef.current;
    if (!element) return;
    const base = element.offsetHeight || 1;
    const available = window.innerHeight - 92;
    const maxScale = Math.min(1.8, Math.max(0.6, available / base));
    if (scale > maxScale) onScaleChange(Number(maxScale.toFixed(2)));
  }, [scale, onScaleChange, minimized, chatOpen, state]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // Keep a dragged dock inside the viewport. An undocked dock stays anchored
  // to the right rail, so it is never clamped or marked as dragged.
  useEffect(() => {
    if (!position.dragged) return;
    const clamp = () => {
      const element = dockRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const maxY = Math.max(8, window.innerHeight - rect.height - 12);
      const maxX = Math.max(8, window.innerWidth - rect.width - 8);
      const nextX = Math.min(Math.max(8, position.x), maxX);
      const nextY = Math.min(Math.max(8, position.y), maxY);
      if (nextX !== position.x || nextY !== position.y) onPositionChange({ x: nextX, y: nextY, dragged: true });
    };
    clamp();
    const frame = window.requestAnimationFrame(clamp);
    window.addEventListener('resize', clamp);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', clamp);
    };
  }, [position.x, position.y, position.dragged, onPositionChange]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const onResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const next = Math.max(0.6, Math.min(1.8, scale + (event.clientY - event.clientX) * 0.0004));
      onScaleChange(Number(next.toFixed(2)));
    },
    [scale, onScaleChange],
  );

  if (!visible) return null;

  return (
    <div
      ref={dockRef}
      className={`aemeath-dock${minimized ? ' is-minimized' : ''}${reducedMotion ? ' reduced-motion' : ''}${position.dragged ? ' is-dragged' : ''}${chatOpen ? ' is-open' : ''}`}
      style={{
        ...(position.dragged ? { left: position.x, right: 'auto', top: position.y } : {}),
        transform: `scale(${scale})`,
        transformOrigin: position.dragged ? 'top left' : 'top right',
      }}
    >
      <div
        className="aemeath-dock-bar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => {
          if (isCompact && minimized) {
            setMinimized(false);
            setChatOpen(true);
          }
        }}
        role={isCompact && minimized ? 'button' : undefined}
        aria-label={isCompact && minimized ? 'Open Aemeath' : undefined}
      >
        <span className="aemeath-dock-title">Aemeath</span>
        {attentionLevel && attentionLevel !== 'none' ? (
          <span className={`aemeath-attention level-${attentionLevel}`} title="Aemeath needs your attention" />
        ) : null}
        <div className="aemeath-dock-actions">
          <button
            type="button"
            className={chatOpen ? 'is-on' : ''}
            onClick={() => {
              if (isCompact) {
                setMinimized(false);
                setChatOpen(true);
                return;
              }
              setChatOpen(!chatOpen);
            }}
            title={t("Talk to Aemeath")}
          >
            ✎
          </button>
          <button
            type="button"
            className={memoryOpen ? 'is-on' : ''}
            onClick={() => setMemoryOpen(value => !value)}
            title="What Aemeath remembers"
          >
            ❤
          </button>
          <button
            type="button"
            className={personalityEnabled ? 'is-on' : ''}
            onClick={() => onPersonalityChange(!personalityEnabled)}
            title={personalityEnabled ? 'Disable character dialogue' : 'Enable character dialogue'}
          >
            ☺
          </button>
          <button
            type="button"
            className={useArtwork ? 'is-on' : ''}
            onClick={() => onUseArtworkChange(!useArtwork)}
            title={useArtwork ? 'Use animated character' : 'Use original artwork'}
          >
            ◐
          </button>
          <button
            type="button"
            className={calm ? 'is-on' : ''}
            onClick={() => onCalmChange(!calm)}
            title={calm ? 'Restore full motion' : 'Calm the motion'}
          >
            ≈
          </button>
          <button type="button" onClick={() => { if (isCompact) { setMinimized(true); setChatOpen(false); return; } setMinimized(value => !value); }} title={minimized ? 'Expand' : 'Minimize'}>
            {minimized ? '▢' : '—'}
          </button>
          <button type="button" onClick={() => onVisibleChange(false)} title="Hide companion">✕</button>
        </div>
      </div>
      {!minimized ? (
        <div className="aemeath-dock-body">
          <div className="aemeath-dock-scroll">
          <CompanionCharacter state={state} detail={detail} speech={speech} useArtwork={useArtwork} calm={calm} />
          <div className="aemeath-shortcuts">
            <button type="button" onClick={() => onDelegate?.('Summarize what we have done.')} title="Ringkas progress">
              <span>{t("Summary")}</span>
            </button>
            <button type="button" onClick={() => onDelegate?.('Check if there are bugs in the newly changed code.')} title="Cek bug">
              <span>{t("Check bug")}</span>
            </button>
            <button type="button" onClick={() => onDelegate?.('Explain the next steps we should take.')} title="Langkah berikutnya">
              <span>{t("Next")}</span>
            </button>
          </div>
          {!chatOpen && onDelegate && suggestions && suggestions.length > 0 ? (
            <div className="aemeath-quick is-ambient">
              {suggestions.slice(0, 2).map(suggestion => (
                <button type="button" key={suggestion.label} onClick={() => onDelegate(suggestion.prompt)}>
                  {suggestion.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="aemeath-chat">
            <div className="aemeath-chat-head">
              <span className="aemeath-chat-title">Chat with Aemeath</span>
              {onChatOpenChange ? (
                <button
                  type="button"
                  className={chatOpen ? 'is-on' : ''}
                  onClick={() => setChatOpen(!chatOpen)}
                  title={chatOpen ? 'Ringkas percakapan' : 'Buka percakapan'}
                >
                  {chatOpen ? '▾' : '▸'}
                </button>
              ) : null}
            </div>
            <div className={chatOpen ? 'aemeath-chat-body' : 'aemeath-chat-body is-hidden'}>
              {liveStatus ? (
                <div className="aemeath-live" role="status">
                  <span className="aemeath-live-spinner" />
                  <span className="aemeath-live-text">{liveStatus}</span>
                </div>
              ) : null}
              <div className="aemeath-chat-log">
                {chatLog.length === 0 ? <div className="aemeath-chat-empty">Ask Aemeath anything about your work.</div> : null}
                {chatLog.map((turn, index) => (
                  <div key={`${turn.role}-${index}`} className={`aemeath-chat-turn ${turn.role}`}>
                    {turn.content}
                  </div>
                ))}
                {chatBusy ? <div className="aemeath-chat-turn assistant is-typing">Aemeath is thinking…</div> : null}
              </div>
              {onRunTool ? (
                <div className="aemeath-quick">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const output = await onRunTool('fs.list', { path: '.' });
                        const entries = Array.isArray(output) ? output.length : 0;
                        setChatLog(current => [...current, { role: 'assistant', content: `Aku lihat workspace-nya: ada ${entries} entri di root project.` }]);
                      } catch (error) {
                        setChatLog(current => [...current, { role: 'assistant', content: error instanceof Error ? error.message : 'Gagal membaca workspace.' }]);
                      }
                    }}
                  >
                    Lihat isi project
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const output = await onRunTool('code.search', { query: 'export ', path: '.' });
                        const hits = Array.isArray(output) ? output.length : 0;
                        setChatLog(current => [...current, { role: 'assistant', content: `Aku cari di project: ada ${hits} hasil yang cocok.` }]);
                      } catch (error) {
                        setChatLog(current => [...current, { role: 'assistant', content: error instanceof Error ? error.message : 'Gagal mencari di project.' }]);
                      }
                    }}
                  >
                    Cari di project
                  </button>
                </div>
              ) : null}
              {onDelegate && suggestions && suggestions.length > 0 ? (
                <div className="aemeath-quick">
                  {suggestions.map(suggestion => (
                    <button type="button" key={suggestion.label} onClick={() => onDelegate(suggestion.prompt)}>
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {goal ? (
            <div className="aemeath-goal" role="status">
              <div className="aemeath-goal-head">
                <span className="aemeath-goal-tag">GOAL</span>
                <span className="aemeath-goal-title">{goal.title}</span>
                <span className="aemeath-goal-pct">{goal.progress}%</span>
              </div>
              <div className="aemeath-goal-bar">
                <span style={{ width: `${Math.max(2, Math.min(100, goal.progress))}%` }} />
              </div>
              {goal.step ? <div className="aemeath-goal-step">{goal.step}</div> : null}
            </div>
          ) : null}
          {routines && routines.length > 0 ? (
            <div className="aemeath-routines" role="list">
              <div className="aemeath-routines-head">{t("Things to remember")}</div>
              {routines.map(routine => (
                <div className="aemeath-routine" key={routine.id} role="listitem">
                  <span className={`aemeath-routine-kind kind-${routine.kind}`} />
                  <span className="aemeath-routine-title">{routine.title}</span>
                  {onCompleteRoutine ? (
                    <button type="button" onClick={() => onCompleteRoutine(routine.id)} title={t("Done")}>✓</button>
                  ) : null}
                  {onRemoveRoutine ? (
                    <button type="button" onClick={() => onRemoveRoutine(routine.id)} title="Hapus">✕</button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {memoryOpen && memories ? (
            <div className="aemeath-memory">
              {voices && onVoiceChange ? (
                <div className="aemeath-voice">
                  <span className="aemeath-voice-label">Gaya bicara</span>
                  <div className="aemeath-voice-options">
                    {voices.map(profile => (
                      <button
                        type="button"
                        key={profile.id}
                        className={voice === profile.id ? 'is-on' : ''}
                        onClick={() => onVoiceChange(profile.id)}
                      >
                        {profile.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {bondSummary ? (
                <div className="aemeath-bond">
                  <div className="aemeath-bond-top">
                    <span>{bondSummary}</span>
                    <span>{Math.round(familiarity ?? 0)}%</span>
                  </div>
                  <div className="aemeath-bond-bar">
                    <span style={{ width: `${Math.max(2, Math.min(100, familiarity ?? 0))}%` }} />
                  </div>
                </div>
              ) : null}
              <div className="aemeath-memory-head">
                <span>What Aemeath remembers</span>
                {memories.length > 0 && onForgetAllMemories ? (
                  <button type="button" onClick={onForgetAllMemories}>Hapus semua</button>
                ) : null}
              </div>
              {memories.length === 0 ? (
                <div className="aemeath-memory-empty">Nothing remembered yet. Tell me about your work~</div>
              ) : (
                memories.map(memory => (
                  <div className="aemeath-memory-row" key={memory.id}>
                    <span>{memory.note}</span>
                    {onForgetMemory ? (
                      <button type="button" onClick={() => onForgetMemory(memory.id)} title="Lupakan">✕</button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}
          {activity && activity.length > 0 ? (
            <div className="aemeath-log" role="log" aria-label="Aemeath activity">
              {activity.slice(0, 4).map((entry, index) => (
                <div className={`aemeath-log-row${index === 0 ? ' is-current' : ''}`} key={`${entry}-${index}`}>
                  <span className="aemeath-log-dot" />
                  <span className="aemeath-log-text">{entry}</span>
                </div>
              ))}
            </div>
          ) : null}
          </div>
          <div className="aemeath-dock-foot">
            <div className="aemeath-chat-modes">
              <button
                type="button"
                className={chatMode !== 'project' ? 'is-on' : ''}
                onClick={() => onChatModeChange?.('casual')}
                title="Ngobrol santai"
              >
                Ngobrol
              </button>
              <button
                type="button"
                className={chatMode === 'project' ? 'is-on' : ''}
                onClick={() => onChatModeChange?.('project')}
                title="Bantu soal project"
              >
                Project
              </button>
            </div>
            <form
              className="aemeath-chat-form"
              onSubmit={event => {
                event.preventDefault();
                void askCompanion();
              }}
            >
              <input
                value={chatInput}
                onChange={event => setChatInput(event.target.value)}
                placeholder="Talk to Aemeath…"
                disabled={chatBusy}
                aria-label="Message Aemeath"
              />
              <button type="submit" disabled={chatBusy || !chatInput.trim()}>{t("Send")}</button>
            </form>
            <div
              className="aemeath-resize"
              onPointerDown={onResize}
              onPointerMove={event => {
                const target = event.currentTarget;
                target.setPointerCapture(event.pointerId);
                onResize(event);
              }}
              onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
              title="Resize"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
