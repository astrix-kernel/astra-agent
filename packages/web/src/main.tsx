import { I18nProvider, useI18n } from './i18n';
import type { FormEvent } from 'react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, Bot, Check, ChevronDown, Code2, FileCode2, FolderOpen, Menu, MessageSquarePlus, Paperclip, Search, Send, Settings, Sparkles, Square, Terminal, X } from 'lucide-react';
import { CustomizationPage } from './customization.js';
import { CompanionDock } from './companion.js';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AstraLogo } from './logo.js';
import {
  companionGreeting,
  companionReaction,
  companionBondLine,
  companionBondSummary,
  companionContinuityLine,
  companionSessionSummary,
  addRoutine,
  activeGoal,
  companionAttention,
  recordOutcome,
  startAttentionTracker,
  advanceGoal,
  applyVoice,
  companionGoalLine,
  parseCompanionGoals,
  parseGoalCommand,
  startGoal,
  type CompanionGoalStore,
  completeRoutine,
  removeRoutine,
  companionObservationLine,
  companionReview,
  detectRoutine,
  openRoutines,
  parseCompanionRoutines,
  type CompanionRoutineStore,
  companionReactionLine,
  companionTone,
  COMPANION_CHECKIN_LINES,
  COMPANION_DONE_LINES,
  COMPANION_ERROR_LINES,
  COMPANION_NOTICED_LINES,
  COMPANION_VOICES,
  COMPANION_WORKING_LINES,
  pickLine,
  type CompanionVoice,
  parseCompanionBond,
  recordInteraction,
  type CompanionBond,
  companionSuggestions,
  extractMemoryCandidate,
  forget,
  forgetAll,
  isCompanionAddress,
  parseCompanionMemory,
  remember,
  relevantMemories,
  stripCompanionAddress,
  type CompanionMemory,
  type CompanionState,
} from '@astra/core/companion';
import './styles.css';

interface Message { role: 'user' | 'assistant'; content: string; tool?: string; status?: 'working' | 'done' | 'error' }
interface Chat { id: string; title: string; messages: Message[]; updatedAt: number }
interface Customization { depth: 'balanced' | 'deep' | 'systems'; autoContext: boolean; verifyAfterChanges: boolean; explainDecisions: boolean; safeWrites: boolean; }
interface ModelOption { id: string; name: string; provider: string; description?: string; }
interface ProviderOption { id: string; name: string; type: 'openai' | 'mock'; configured: boolean; baseUrl: string; modelId?: string; }
interface WorkspaceOption { id: string; name: string; root: string; }
const STORAGE_KEY = 'astra.chats.v1';
const SETTINGS_KEY = 'astra.customization.v1';
const MODEL_KEY = 'astra.model.v1';
const PROVIDER_KEY = 'astra.provider.v1';
const WORKSPACE_KEY = 'astra.workspace.v1';
const WORKSPACES_KEY = 'astra.workspaces.v1';
const COMPANION_VISIBLE_KEY = 'astra.companion.visible';
const COMPANION_SCALE_KEY = 'astra.companion.scale';
const COMPANION_POSITION_KEY = 'astra.companion.position';
const COMPANION_PERSONALITY_KEY = 'astra.companion.personality';
const COMPANION_ARTWORK_KEY = 'astra.companion.artwork';
const COMPANION_CALM_KEY = 'astra.companion.calm';
const COMPANION_MEMORY_KEY = 'astra.companion.memory';
const COMPANION_BOND_KEY = 'astra.companion.bond';
const COMPANION_VOICE_KEY = 'astra.companion.voice';
const COMPANION_ROUTINES_KEY = 'astra.companion.routines';
const COMPANION_GOALS_KEY = 'astra.companion.goals';
const defaultCustomization: Customization = { depth: 'deep', autoContext: true, verifyAfterChanges: true, explainDecisions: true, safeWrites: false };

function renderContent(content: string) {
  return content.split(/(```[\\s\\S]*?```)/g).map((part, index) => part.startsWith('```') ? <pre key={index}><code>{part.replace(/^```[a-z]*\\n?|```$/g, '')}</code></pre> : <span key={index}>{part}</span>);
}

function App() {
  const { t } = useI18n();
  const [chats, setChats] = useState<Chat[]>(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Chat[]; } catch { return []; } });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 760px)').matches);
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState<string[]>([]);
  const [mode, setMode] = useState<'chat' | 'code' | 'research' | 'self-heal'>('chat');
  const [notice, setNotice] = useState('');
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [settings, setSettings] = useState<Customization>(() => { try { return { ...defaultCustomization, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Customization> }; } catch { return defaultCustomization; } });
  const [models, setModels] = useState<ModelOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>(() => { try { return JSON.parse(localStorage.getItem(WORKSPACES_KEY) ?? '[]') as WorkspaceOption[]; } catch { return []; } });
  const [modelId, setModelId] = useState(() => localStorage.getItem(MODEL_KEY) ?? 'auto/best-coding-fast');
  const [providerId, setProviderId] = useState(() => localStorage.getItem(PROVIDER_KEY) ?? 'mock');
  const [workspaceId, setWorkspaceId] = useState(() => localStorage.getItem(WORKSPACE_KEY) ?? 'default');
  const [configOpen, setConfigOpen] = useState<'model' | 'provider' | 'workspace' | 'mode' | null>(null);
  const [customProviderOpen, setCustomProviderOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [browserPath, setBrowserPath] = useState<string | null>(null);
  const [browserEntries, setBrowserEntries] = useState<{ name: string; path: string }[]>([]);
  const [browserParent, setBrowserParent] = useState<string | null>(null);
  const [browserError, setBrowserError] = useState('');
  const [goalState, setGoalState] = useState<'idle' | 'running' | 'complete' | 'blocked'>('idle');
  const [workspaceUploading, setWorkspaceUploading] = useState(false);
  const [companionState, setCompanionState] = useState<CompanionState>('idle');
  const [companionDetail, setCompanionDetail] = useState<string | undefined>(undefined);
  const [companionSpeech, setCompanionSpeech] = useState<string | undefined>(undefined);
  const [companionVisible, setCompanionVisible] = useState(() => localStorage.getItem(COMPANION_VISIBLE_KEY) !== '0');
  const [companionChatOpen, setCompanionChatOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 760px)').matches);
  const [companionScale, setCompanionScale] = useState(() => Number(localStorage.getItem(COMPANION_SCALE_KEY) ?? '1') || 1);
  const [companionPersonality, setCompanionPersonality] = useState(() => localStorage.getItem(COMPANION_PERSONALITY_KEY) === '1');
  const [companionArtwork, setCompanionArtwork] = useState(() => localStorage.getItem(COMPANION_ARTWORK_KEY) === '1');
  const [companionCalm, setCompanionCalm] = useState(() => localStorage.getItem(COMPANION_CALM_KEY) === '1');
  const [companionActivity, setCompanionActivity] = useState<string[]>([]);
  const [companionChatHistory, setCompanionChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [companionChatMode, setCompanionChatMode] = useState<'casual' | 'project'>('casual');
  const [companionMemory, setCompanionMemory] = useState<CompanionMemory>(() => parseCompanionMemory(localStorage.getItem(COMPANION_MEMORY_KEY)));
  const [companionBond, setCompanionBond] = useState<CompanionBond>(() => parseCompanionBond(localStorage.getItem(COMPANION_BOND_KEY)));
  const [companionVoice, setCompanionVoice] = useState<CompanionVoice>(() => (localStorage.getItem(COMPANION_VOICE_KEY) as CompanionVoice | null) ?? 'gembira');
  const [companionRoutines, setCompanionRoutines] = useState<CompanionRoutineStore>(() => parseCompanionRoutines(localStorage.getItem(COMPANION_ROUTINES_KEY)));
  const [companionGoals, setCompanionGoals] = useState<CompanionGoalStore>(() => parseCompanionGoals(localStorage.getItem(COMPANION_GOALS_KEY)));
  const voiceSeed = useRef(0);
  const lastReplyRef = useRef<string>('');
  const attentionRef = useRef(startAttentionTracker());
  const lastActivityRef = useRef(Date.now());
  const [attentionLevel, setAttentionLevel] = useState<'none' | 'soft' | 'normal' | 'urgent'>('none');
  const nextVoiceSeed = () => {
    voiceSeed.current += 1;
    return voiceSeed.current;
  };
  const [companionMoments, setCompanionMoments] = useState<{ kind: 'greet' | 'request' | 'tool' | 'reply' | 'error' | 'done'; text: string; at: number }[]>([]);
  const addMoment = (kind: 'greet' | 'request' | 'tool' | 'reply' | 'error' | 'done', text: string) =>
    setCompanionMoments(current => [...current, { kind, text, at: Date.now() }].slice(-30));
  const pushActivity = (entry: string) => setCompanionActivity(current => [entry, ...current].slice(0, 8));
  const runCompanionTool = async (tool: string, input: Record<string, unknown>) => {
    setCompanionState('using_tool');
    setCompanionSpeech(`One moment, let me check using ${tool}~`);
    setCompanionDetail(`Running ${tool}`);
    const response = await fetch('/api/companion/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool, input, workspaceId }) });
    const payload = await response.json() as { output?: unknown; error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'The companion could not run that tool.');
    pushActivity(`Ran ${tool}`);
    return payload.output;
  };
  const liveSuggestions = useMemo(
    () =>
      companionSuggestions({
        hasWorkspace: workspaceId !== 'default',
        hasChats: chats.length > 0,
        isError: companionState === 'error',
        isIdle: companionState === 'idle',
      }),
    [chats.length, companionState, workspaceId],
  );
  const askAemeath = async (message: string, history: { role: 'user' | 'assistant'; content: string }[]) => {
    setCompanionState('thinking');
    setCompanionSpeech(t("Hmm, let me think for a moment..."));
    setCompanionDetail('Thinking');
    pushActivity('You asked Aemeath a question');
    const candidate = extractMemoryCandidate(message);
    setCompanionBond(current => recordInteraction(current, { message: true, newConversation: true }));
    if (candidate) setCompanionMemory(current => remember(current, candidate.note, candidate.source));
    setCompanionBond(current => recordInteraction(current, { message: true }));
    if (candidate) setCompanionBond(current => recordInteraction(current, { note: true }));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    let response: Response;
    try {
      response = await fetch('/api/companion/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, history, modelId, providerId, workspaceId, mode: companionChatMode, memories: relevantMemories(companionMemory, message), sessionSummary: companionSessionSummary(companionMoments) }), signal: controller.signal });
    } catch (error) {
      window.clearTimeout(timeout);
      if ((error as Error).name === 'AbortError') throw new Error('Aemeath took too long to answer. Check the model provider.');
      throw new Error('Aemeath cannot reach the Astra API right now.');
    }
    window.clearTimeout(timeout);
    const raw = await response.text();
    let payload: { events?: { type: string; text?: string }[]; error?: string };
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch (e) {
      throw new Error(`Aemeath got an unexpected reply (${response.status}): ${raw.slice(0, 200)}`);
    }
    if (!response.ok) throw new Error(payload.error ?? `Aemeath could not answer right now (${response.status})`);
    const reply = (payload.events ?? []).filter(event => event.type === 'text').map(event => event.text ?? '').join('').trim();
    if (!reply) throw new Error('Aemeath stayed quiet. Check the model provider configuration.');
    setCompanionState('speaking');
    setCompanionSpeech(reply.slice(0, 160));
    setCompanionDetail('Speaking');
    let spoken = '';
    const step = Math.max(1, Math.ceil(reply.length / 80));
    for (let offset = 0; offset < reply.length; offset += step) {
      spoken += reply.slice(offset, offset + step);
      setCompanionSpeech(spoken.slice(-160));
      await new Promise(resolve => window.setTimeout(resolve, 24));
    }
    setCompanionState('success');
    setCompanionDetail('All done');
    pushActivity('Aemeath replied');
    return reply;
  };
  const [companionPosition, setCompanionPosition] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(COMPANION_POSITION_KEY) ?? 'null') as { x: number; y: number } | null;
      // Older builds stored an absolute left offset that conflicts with the
      // right-anchored rail, so only a dragged position is honoured.
      return stored && stored.x >= 0 ? stored : null;
    } catch {
      return null;
    }
  });
  const [modelSearch, setModelSearch] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const active = chats.find(chat => chat.id === activeId);
  const visibleChats = useMemo(() => chats.filter(chat => chat.title.toLowerCase().includes(search.toLowerCase())), [chats, search]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, 30))); }, [chats]);
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem(MODEL_KEY, modelId); }, [modelId]);
  useEffect(() => { localStorage.setItem(PROVIDER_KEY, providerId); }, [providerId]);
  useEffect(() => { localStorage.setItem(WORKSPACE_KEY, workspaceId); }, [workspaceId]);
  useEffect(() => { localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces)); }, [workspaces]);
  useEffect(() => { localStorage.setItem(WORKSPACE_KEY, workspaceId); }, [workspaceId]);
  useEffect(() => { localStorage.setItem(COMPANION_VISIBLE_KEY, companionVisible ? '1' : '0'); }, [companionVisible]);
  useEffect(() => {
    const greeting = companionGreeting(new Date().getHours());
    setCompanionSpeech(t("Hi~ I am here if you need anything."));
    setCompanionDetail(greeting.mood);
  }, [t]);
  useEffect(() => {
    if (busy || companionState !== 'idle') return;
    const timer = window.setInterval(() => {
      const checkin = companionReaction('idle', Math.floor(Date.now() / 60000));
      setCompanionSpeech(t("Hi~ I am here if you need anything."));
      setCompanionDetail(checkin.mood);
    }, 75_000);
    return () => window.clearInterval(timer);
  }, [busy, companionState, t]);
  // Attention: she checks the real run and speaks up when it matters.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const tracker = attentionRef.current;
      const attention = companionAttention({
        consecutiveFailures: tracker.consecutiveFailures,
        repeatedErrors: tracker.repeatedErrors,
        elapsedMs: busy ? Date.now() - tracker.startedAt : 0,
        idleMs: busy ? 0 : Date.now() - lastActivityRef.current,
        waitingForInput: false,
        goalProgressed: false,
      });
      if (!attention) {
        setAttentionLevel('none');
        return;
      }
      setAttentionLevel(attention.level);
      if (attention.level === 'urgent' || attention.level === 'normal') {
        setCompanionSpeech(t("I am working on it~"));
        pushActivity(attention.reason);
      }
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [busy, companionVoice]);
  // A gentle nudge when the user has been quiet for a while.
  useEffect(() => {
    if (busy) return;
    const timer = window.setTimeout(() => {
      if (companionState !== 'idle') return;
      const suggestion = liveSuggestions[0];
      setCompanionSpeech(t('aemeath_suggest'));
      setCompanionDetail(t("Ready"));
    }, 180_000);
    return () => window.clearTimeout(timer);
  }, [busy, companionState, liveSuggestions]);
  useEffect(() => { localStorage.setItem(COMPANION_SCALE_KEY, String(companionScale)); }, [companionScale]);
  useEffect(() => { localStorage.setItem(COMPANION_POSITION_KEY, JSON.stringify(companionPosition)); }, [companionPosition]);
  useEffect(() => { localStorage.setItem(COMPANION_PERSONALITY_KEY, companionPersonality ? '1' : '0'); }, [companionPersonality]);
  useEffect(() => { localStorage.setItem(COMPANION_ARTWORK_KEY, companionArtwork ? '1' : '0'); }, [companionArtwork]);
  useEffect(() => { localStorage.setItem(COMPANION_CALM_KEY, companionCalm ? '1' : '0'); }, [companionCalm]);
  useEffect(() => { localStorage.setItem(COMPANION_MEMORY_KEY, JSON.stringify(companionMemory)); }, [companionMemory]);
  useEffect(() => { localStorage.setItem(COMPANION_BOND_KEY, JSON.stringify(companionBond)); }, [companionBond]);
  useEffect(() => { localStorage.setItem(COMPANION_VOICE_KEY, companionVoice); }, [companionVoice]);
  useEffect(() => { localStorage.setItem(COMPANION_ROUTINES_KEY, JSON.stringify(companionRoutines)); }, [companionRoutines]);
  useEffect(() => { localStorage.setItem(COMPANION_GOALS_KEY, JSON.stringify(companionGoals)); }, [companionGoals]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      // The companion stays animated; the preference only softens decorative extras.
      document.documentElement.classList.toggle('reduced-motion', media.matches && companionCalm);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [companionCalm]);
  useEffect(() => { void Promise.all([fetch('/api/models').then(response => response.json() as Promise<{ models?: ModelOption[]; defaultModel?: string }>), fetch('/api/providers').then(response => response.json() as Promise<{ providers?: ProviderOption[] }>), fetch('/api/workspaces').then(response => response.json() as Promise<{ workspaces?: WorkspaceOption[] }>)]).then(([modelData, providerData, workspaceData]) => { setModels(modelData.models ?? []); if (!localStorage.getItem(MODEL_KEY) && modelData.defaultModel) setModelId(modelData.defaultModel); setProviders(providerData.providers ?? []); setWorkspaces(current => { const merged = [...workspaceData.workspaces ?? []]; for (const workspace of current) if (!merged.some(item => item.id === workspace.id)) merged.push(workspace); return merged; }); }).catch(() => setNotice('Unable to load model, provider, and workspace settings.')); }, []);
  useEffect(() => { if (!providerId) return; setModelsLoading(true); void fetch(`/api/models?providerId=${encodeURIComponent(providerId)}`).then(response => response.json() as Promise<{ models?: ModelOption[]; defaultModel?: string }>).then(data => { setModels(data.models ?? []); if (data.defaultModel && !data.models?.some(model => model.id === modelId)) setModelId(data.defaultModel); }).catch(() => setNotice('Unable to load models for this provider.')).finally(() => setModelsLoading(false)); }, [providerId]);
  useEffect(() => { setModelsLoading(true); void fetch('/api/models/catalog').then(response => response.json() as Promise<{ models?: ModelOption[] }>).then(data => { if (data.models?.length) setModels(data.models); }).catch(() => setNotice('Unable to load the model catalog.')).finally(() => setModelsLoading(false)); }, [providers.length]);
  useEffect(() => { if (!providerId) return; void fetch(`/api/providers/models?providerId=${encodeURIComponent(providerId)}`).then(response => response.json() as Promise<{ models?: ModelOption[] }>).then(data => { if (data.models?.length) setModels(current => { const seen = new Set(current.map(model => `${model.provider}:${model.id}`)); return [...current, ...data.models!.filter(model => !seen.has(`${model.provider}:${model.id}`))]; }); }).catch(() => undefined); }, [providerId, providers.length]);
  useEffect(() => { const handler = (event: MouseEvent) => { const target = event.target as HTMLElement; if (configOpen !== 'model') return; if (target.closest('.model-modal') || target.closest('.model-panel') || target.closest('.model-pill')) return; setConfigOpen(null); }; document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler); }, [configOpen]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (configOpen === 'model') setConfigOpen(null); else if (customProviderOpen) setCustomProviderOpen(false); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [configOpen, customProviderOpen]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); createChat(); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);
  const createChat = () => { const chat = { id: crypto.randomUUID(), title: t("New conversation"), messages: [], updatedAt: Date.now() }; setChats(current => [chat, ...current]); setActiveId(chat.id); setActivity([]); };
  const updateChat = (targetId: string, fn: (chat: Chat) => Chat) => setChats(current => current.map(chat => chat.id === targetId ? fn(chat) : chat));
  const stop = () => { abortRef.current?.abort(); abortRef.current = null; setBusy(false); };
  const addProvider = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get('name') ?? '').trim(); const baseUrl = String(form.get('baseUrl') ?? '').trim(); const apiKey = String(form.get('apiKey') ?? '').trim(); const rawId = String(form.get('id') ?? '').trim(); const id = rawId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'provider'; if (!name || !baseUrl) { setNotice('Provider name and endpoint are required.'); return; } setModelsLoading(true); const response = await fetch('/api/providers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, name, type: 'openai', baseUrl, apiKey }) }); const data = await response.json() as { error?: string }; if (!response.ok) { setModelsLoading(false); setNotice(data.error ?? 'Unable to add provider.'); return; } const providerData = await fetch('/api/providers').then(result => result.json() as Promise<{ providers?: ProviderOption[] }>); setProviders(providerData.providers ?? []); setProviderId(id); const modelData = await fetch(`/api/providers/models?providerId=${encodeURIComponent(id)}`).then(result => result.json() as Promise<{ models?: ModelOption[] }>); const discovered = modelData.models ?? []; if (discovered.length > 0) { setModels(current => { const seen = new Set(current.map(model => `${model.provider}:${model.id}`)); return [...current, ...discovered.filter(model => !seen.has(`${model.provider}:${model.id}`))]; }); setModelId(discovered[0]?.id ?? modelId); } setModelsLoading(false); setCustomProviderOpen(false); setNotice(`${name} provider connected with ${modelData.models?.length ?? 0} models.`); };
  const removeProvider = async (id: string) => { const response = await fetch(`/api/providers/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (!response.ok) { const data = await response.json() as { error?: string }; setNotice(data.error ?? 'Unable to remove provider.'); return; } const providerData = await fetch('/api/providers').then(result => result.json() as Promise<{ providers?: ProviderOption[] }>); setProviders(providerData.providers ?? []); if (providerId === id) setProviderId(providerData.providers?.[0]?.id ?? 'mock'); setNotice('Provider removed.'); };
  const chooseWorkspaceFolder = async (event: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(event.target.files ?? []); const first = files[0]; if (!first || workspaceUploading) return; const relativePath = first.webkitRelativePath; const folderName = relativePath.split('/')[0] || first.name; const id = `${folderName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}-${Date.now()}`; setWorkspaceUploading(true); setNotice(`Preparing ${files.length} files from ${folderName}…`); try { const supportedFiles = files.map(file => ({ file, path: file.webkitRelativePath.split('/').slice(1).join('/') || file.name })).filter(item => !/(^|\/)node_modules(\/|$)|(^|\/)\.git(\/|$)/.test(item.path) && /\.(txt|md|json|js|jsx|ts|tsx|css|html|yml|yaml|toml|py|go|rs|java|c|cpp|h|sql|sh)$/i.test(item.path)); if (supportedFiles.length === 0) throw new Error('No supported text files found in this folder.'); let data: { error?: string; workspace?: WorkspaceOption } = {}; const chunkSize = 100; for (let index = 0; index < supportedFiles.length; index += chunkSize) { const chunk = await Promise.all(supportedFiles.slice(index, index + chunkSize).map(async item => ({ path: item.path, content: await item.file.text() }))); setNotice(`Uploading ${Math.min(index + chunk.length, supportedFiles.length)} of ${supportedFiles.length} files from ${folderName}…`); let response: Response | undefined; for (let attempt = 0; attempt < 6; attempt += 1) { response = await fetch('/api/workspaces/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, name: folderName, files: chunk }) }); if (response.status !== 429) break; setNotice(`Upload busy, retrying chunk ${Math.floor(index / chunkSize) + 1}…`); await new Promise(resolve => window.setTimeout(resolve, 500 * (attempt + 1))); } if (!response) throw new Error('Workspace upload did not start.'); const raw = await response.text(); try { data = JSON.parse(raw) as typeof data; } catch { throw new Error(`Workspace upload failed (${response.status}).`); } if (!response.ok || !data.workspace) throw new Error(data.error ?? 'Workspace import failed'); } const importedWorkspace = data.workspace; if (!importedWorkspace) throw new Error('Workspace import returned no workspace.'); setWorkspaces(current => [...current.filter(workspace => workspace.id !== importedWorkspace.id), importedWorkspace]); setWorkspaceId(importedWorkspace.id); localStorage.setItem(WORKSPACE_KEY, importedWorkspace.id); setWorkspaceOpen(false); setConfigOpen(null); setNotice(`${folderName} workspace is now active.`); try { const refreshed = await fetch('/api/workspaces'); if (refreshed.ok) { const refreshedData = await refreshed.json() as { workspaces?: WorkspaceOption[] }; if (refreshedData.workspaces?.some(workspace => workspace.id === importedWorkspace.id)) setWorkspaces(refreshedData.workspaces); } } catch { /* keep the confirmed workspace */ } } catch (error) { setNotice(error instanceof Error ? error.message : 'Workspace import failed.'); } finally { setWorkspaceUploading(false); event.target.value = ''; } };
  const browseDirectory = async (target?: string) => { setBrowserError(''); const query = target ? `?path=${encodeURIComponent(target)}` : ''; try { const response = await fetch(`/api/fs/directories${query}`); const data = await response.json() as { path?: string; parent?: string | null; directories?: { name: string; path: string }[]; error?: string }; if (!response.ok) throw new Error(data.error ?? 'Unable to list directories.'); setBrowserPath(data.path ?? null); setBrowserParent(data.parent ?? null); setBrowserEntries(data.directories ?? []); } catch (error) { setBrowserError(error instanceof Error ? error.message : 'Unable to list directories.'); } };
  const useBrowsedFolder = () => { if (!browserPath) return; const folderName = browserPath.split('/').filter(Boolean).pop() ?? 'workspace'; const id = `${folderName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}-${Date.now()}`; setWorkspaces(current => [...current.filter(workspace => workspace.id !== id), { id, name: folderName, root: browserPath }]); setWorkspaceId(id); localStorage.setItem(WORKSPACE_KEY, id); setWorkspaceOpen(false); setNotice(`${folderName} workspace selected at ${browserPath}.`); };
  const selectedWorkspace = workspaces.find(workspace => workspace.id === workspaceId);
  const selectedModel = models.find(model => model.id === modelId);
  const filteredModels = useMemo(() => { const query = modelSearch.trim().toLowerCase(); if (!query) return models; return models.filter(model => `${model.id} ${model.name} ${model.description ?? ''} ${model.provider}`.toLowerCase().includes(query)); }, [models, modelSearch]);
  const [modelLimit, setModelLimit] = useState(120);
  useEffect(() => { setModelLimit(120); }, [modelSearch, models]);
  const visibleModels = useMemo(() => filteredModels.slice(0, modelLimit), [filteredModels, modelLimit]);
  const modelListRef = useRef<HTMLDivElement | null>(null);
  const loadMoreModels = () => setModelLimit(current => (current >= filteredModels.length ? current : current + 120));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let text = input.trim();
    if (!text || busy) return;
    if (isCompanionAddress(text)) {
      const asked = stripCompanionAddress(text) || text;
      setInput('');
      const tone = companionTone(asked);
      const reactionLine = companionContinuityLine(companionMoments) ?? companionReactionLine(tone);
      setCompanionState('thinking');
      setCompanionSpeech(t("Hmm, let me think for a moment..."));
      setCompanionDetail('Thinking');
      pushActivity('You called Aemeath by name');
      try {
        const reply = await askAemeath(asked, companionChatHistory);
        setCompanionChatHistory(current => [...current, { role: 'user', content: asked }, { role: 'assistant', content: reply }]);
        setCompanionState('success');
        setCompanionDetail('All done');
      } catch (error) {
        setCompanionState('error');
        setCompanionDetail('Error');
        setNotice(error instanceof Error ? error.message : 'Aemeath could not answer.');
      }
      return;
    }
    const goalTitle = parseGoalCommand(text);
    if (goalTitle) {
      setGoalState('running');
      setCompanionGoals(current => startGoal(current, goalTitle));
      setCompanionState('planning');
      setCompanionDetail('Goal accepted');
      setCompanionSpeech(`${t('aemeath_goal')}: ${goalTitle}`);
      setNotice(`Goal accepted: ${goalTitle}`);
      
      // DO NOT return here. Format the text so the main Astra chat processes it natively.
      text = `Goal: ${goalTitle}\n\nWork toward this goal step by step. Explain what you did in one short paragraph.`;
    }
    let chatId = activeId;
    if (!chatId) {
      const chat = { id: crypto.randomUUID(), title: text.slice(0, 42), messages: [], updatedAt: Date.now() };
      setChats(current => [chat, ...current]);
      chatId = chat.id;
      setActiveId(chat.id);
    }
    setInput('');
    setBusy(true);
    setActivity([]);
    const tone = companionTone(text);
    const reactionLine = companionReactionLine(tone);
    setCompanionState('listening');
    setCompanionSpeech(t("I am listening..."));
    setCompanionDetail('Listening');
    setCompanionActivity([]);
    attentionRef.current = startAttentionTracker();
    lastActivityRef.current = Date.now();
    setAttentionLevel('none');
    pushActivity('Received your request');
    addMoment('request', text);
    const candidate = extractMemoryCandidate(text);
    if (candidate) setCompanionMemory(current => remember(current, candidate.note, candidate.source));
    setCompanionBond(current => recordInteraction(current, { message: true }));
    if (candidate) setCompanionBond(current => recordInteraction(current, { note: true }));
    const user: Message = { role: 'user', content: text };
    const assistant: Message = { role: 'assistant', content: '', status: 'working' };
    setChats(current => current.map(chat => chat.id === chatId ? { ...chat, title: chat.messages.length ? chat.title : text.slice(0, 42), messages: [...chat.messages, user, assistant], updatedAt: Date.now() } : chat));
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const timeout = window.setTimeout(() => controller.abort(), 1_200_000);
      const response = await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: `${text}\n\nAstra customization: reasoning=${settings.depth}; autoContext=${settings.autoContext}; verifyAfterChanges=${settings.verifyAfterChanges}; explainDecisions=${settings.explainDecisions}; safeWrites=${settings.safeWrites}`, workspaceRoot: workspaces.find(w => w.id === workspaceId)?.root ?? workspaceId, modelId, providerId, mode, executionMode: (mode === 'code' || Boolean(goalTitle)) ? 'auto-edit' : 'suggest', allowWrite: settings.safeWrites }), signal: controller.signal });
      const result = await response.json() as { events?: { type: string; text?: string; tool?: string; error?: string }[]; error?: string };
      window.clearTimeout(timeout);
      if (!response.ok) throw new Error(result.error ?? 'Request failed');
      const events = result.events ?? [];
      if (events.length === 0) throw new Error('Astra returned no events. Check the API provider configuration.');
      for (const item of events) {
        if (item.type === 'text') {
          setCompanionState('speaking');
          setCompanionDetail('Speaking');
          // When the agent writes something substantial, she reacts to it first.
          if (item.text && item.text.length > 220) {
            setCompanionSpeech(t("I am working on it~"));
          }
          // Reveal the reply progressively so Aemeath visibly talks instead of
          // flashing past the speaking state.
          const chunk = item.text ?? '';
          const step = Math.max(1, Math.ceil(chunk.length / 90));
          let spoken = '';
          for (let offset = 0; offset < chunk.length; offset += step) {
            const piece = chunk.slice(offset, offset + step);
            spoken += piece;
            lastReplyRef.current = spoken;
            setCompanionSpeech(spoken.slice(-140));
            updateChat(chatId, chat => ({ ...chat, messages: chat.messages.map((message, index) => index === chat.messages.length - 1 ? { ...message, content: message.content + piece } : message) }));
            await new Promise(resolve => window.setTimeout(resolve, 22));
          }
        }
        if (item.type === 'tool_start') {
          setActivity(current => [...current, item.tool ?? 'tool']);
          setCompanionState('using_tool');
          const remark = companionObservationLine({ tool: item.tool ?? 'tool', toolCount: activity.length });
          setCompanionSpeech(t("I am working on it~"));
          setCompanionDetail(item.tool ? `Running ${item.tool}` : t("Working"));
          pushActivity(item.tool ? `Running ${item.tool}` : 'Running a tool');
          addMoment('tool', item.tool ?? 'tool');
          setCompanionGoals(current => {
            const goal = activeGoal(current);
            return goal ? advanceGoal(current, goal.id, `running ${item.tool ?? 'tool'}`) : current;
          });
          updateChat(chatId, chat => ({ ...chat, messages: chat.messages.map((message, index) => index === chat.messages.length - 1 && item.tool ? { ...message, tool: item.tool } : message) }));
        }
        if (item.type === 'error') {
          attentionRef.current = recordOutcome(attentionRef.current, item.error);
          setCompanionState('error');
          setCompanionSpeech(t("Hmm, there is an error... let me check again."));
          setCompanionDetail(item.error ?? 'Something went wrong');
          pushActivity(`Error: ${item.error ?? 'unknown error'}`);
          addMoment('error', item.error ?? 'unknown error');
          updateChat(chatId, chat => ({ ...chat, messages: chat.messages.map((message, index) => index === chat.messages.length - 1 ? { ...message, content: `${message.content}\n\n${item.error ?? 'Unknown error'}`, status: 'error' } : message) }));
        }
        if (item.type === 'done') {
          // She looks at what the agent produced and reacts to it.
          const finished = lastReplyRef.current;
          if (finished) {
            const routine = detectRoutine(finished);
            if (routine) {
              setCompanionRoutines(current => addRoutine(current, routine));
              setCompanionSpeech(`${t("I will note this down")}: ${routine.title}`);
            } else {
              const review = companionReview(finished, nextVoiceSeed());
              if (review) setCompanionSpeech(applyVoice(review, companionVoice, nextVoiceSeed()));
            }
          }
          attentionRef.current = recordOutcome(attentionRef.current);
          setCompanionState('success');
          setCompanionSpeech(t("Success! You are great!"));
          setCompanionDetail('All done');
          pushActivity('Task completed');
          addMoment('done', 'task completed');
          updateChat(chatId, chat => ({ ...chat, messages: chat.messages.map((message, index) => index === chat.messages.length - 1 ? { ...message, status: 'done' } : message) }));
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') { setCompanionState('cancelled'); setCompanionDetail('Cancelled'); }
      else { setCompanionState('error'); setCompanionDetail('Connection failed'); }
      updateChat(chatId, chat => ({ ...chat, messages: chat.messages.map((message, index) => index === chat.messages.length - 1 ? { ...message, content: (error as Error).name === 'AbortError' ? 'Request timed out after 20 minutes. The task may have exceeded the configured time limit.' : `Unable to reach Astra API: ${error instanceof Error ? error.message : String(error)}`, status: 'error' } : message) }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };
  if (customizationOpen) return <CustomizationPage onClose={() => setCustomizationOpen(false)} />;
  return <div className={`app-shell${sidebarOpen ? '' : ' sidebar-collapsed'}${companionVisible ? ' has-companion' : ''}`}>
    <aside className={`sidebar ${sidebarOpen ? '' : 'closed'}`}>
      <div className="brand"><span className="brand-mark"><AstraLogo size={22} /></span><span>Astra</span><button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)}><X size={16} /></button></div>
      <button className="new-chat" onClick={createChat}><MessageSquarePlus size={16} /> {t("New chat")} <span className="shortcut">⌘ K</span></button>
      <label className="search-box"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Search conversations")} /></label>
      <nav className="primary-nav"><button onClick={createChat}><MessageSquarePlus size={16} /> {t("New chat")}</button><button onClick={() => setConfigOpen('workspace')}><FolderOpen size={16} /> {t("Projects")}</button><button onClick={() => setNotice('Artifacts are generated by agent tasks. Ask Astra to create an artifact in this workspace.')}><Archive size={16} /> {t("Artifacts")}</button><button onClick={() => { setMode('code'); setConfigOpen('mode'); }}><Code2 size={16} /> {t("Code")}</button><button onClick={() => setCustomProviderOpen(true)}><Settings size={16} /> {t("Custom providers")}</button><button className={customizationOpen ? 'active' : ''} onClick={() => setCustomizationOpen(value => !value)}><Settings size={16} /> {t("Customization")}</button></nav>
      <div className="section-label">{t("Recent conversations")}</div><nav className="chat-list">{visibleChats.length === 0 ? <div className="aemeath-memory-empty" style={{ padding: '8px 12px', color: '#9b9a96', fontSize: '0.75rem', textAlign: 'center' }}>{t('no_conversations')}</div> : visibleChats.map(chat => <button className={chat.id === activeId ? 'selected' : ''} key={chat.id} onClick={() => { setActiveId(chat.id); setActivity([]); }}><span>{chat.title?.trim() || t("New conversation")}</span></button>)}</nav>
      <div className="sidebar-footer"><span className={`status-dot ${goalState === 'running' || workspaceUploading ? 'pulse' : ''}`} /> {workspaceUploading ? 'Importing workspace' : goalState === 'running' ? 'Goal running' : goalState === 'complete' ? 'Goal complete' : selectedWorkspace?.name ?? 'Local workspace'}<div className="provider-note">{workspaceUploading ? 'Keep this tab open while files upload' : goalState === 'running' ? 'Astra is working toward your goal' : 'Live model status is shown in the header'}</div></div>
    </aside>
    {customizationOpen && <aside className="h-full flex flex-col customization-panel"><div className="panel-heading"><div><span className="eyebrow">{t('control_center')}</span><h2>{t("Customization")}</h2></div><button className="icon-button" onClick={() => setCustomizationOpen(false)}><X size={16} /></button></div><p className="panel-intro">{t('panel_intro')}</p><label className="setting-label">{t('reasoning_depth')}<select value={settings.depth} onChange={event => setSettings(current => ({ ...current, depth: event.target.value as Customization['depth'] }))}><option value="balanced">{t('balanced')}</option><option value="deep">{t('deep')}</option><option value="systems">{t('systems')}</option></select></label><div className="setting-group"><span className="setting-label">{t('coding_intelligence')}</span><label className="toggle-row"><input type="checkbox" checked={settings.autoContext} onChange={event => setSettings(current => ({ ...current, autoContext: event.target.checked }))} /><span>{t('inspect_files')}</span></label><label className="toggle-row"><input type="checkbox" checked={settings.verifyAfterChanges} onChange={event => setSettings(current => ({ ...current, verifyAfterChanges: event.target.checked }))} /><span>{t('verify_changes')}</span></label><label className="toggle-row"><input type="checkbox" checked={settings.explainDecisions} onChange={event => setSettings(current => ({ ...current, explainDecisions: event.target.checked }))} /><span>{t('explain_decisions')}</span></label><label className="toggle-row"><input type="checkbox" checked={settings.safeWrites} onChange={event => setSettings(current => ({ ...current, safeWrites: event.target.checked }))} /><span>{t('allow_writes')}</span></label></div><div className="capability-grid"><span>{t('code_tracing')}</span><span>{t('test_recovery')}</span><span>{t('systems_reasoning')}</span><span>{t('security_checks')}</span></div><button className="reset-button" onClick={() => setSettings(defaultCustomization)}>{t('reset_defaults')}</button></aside>}
    <main className="flex-1 h-full overflow-y-auto workspace"><header className="topbar"><button id="sidebarToggle" className="icon-button" onClick={() => setSidebarOpen(value => !value)}><Menu size={18} /></button><span className="workspace-title">{active?.title ?? 'Astra'}</span><div className="topbar-spacer" /><span className="model-status"><span className="status-dot" /> {busy ? t("Working") : t("Ready")}</span><LanguageSwitcher /><div className="config-controls"><div className="config-menu"><button className="model-selector" onClick={() => setCustomProviderOpen(true)} title={t("Custom providers")}><Settings size={15} /><span>{t("Custom providers")}</span></button></div><div className="config-menu"><button className="model-selector" onClick={() => setConfigOpen(configOpen === 'workspace' ? null : 'workspace')} title={t("Workspace")}><FolderOpen size={15} /><span>{selectedWorkspace?.name ?? t("Workspace")}</span><ChevronDown size={14} /></button>{configOpen === 'workspace' && <div className="config-popover"><div className="popover-title">{t("Workspace")}</div>{workspaces.map(workspace => <button key={workspace.id} className={workspace.id === workspaceId ? 'selected' : ''} onClick={() => { setWorkspaceId(workspace.id); setWorkspaces(current => current.map(item => item.id === workspace.id ? { ...item, name: workspace.name, root: workspace.root } : item)); setConfigOpen(null); }}>{workspace.name}<small>{workspace.root}</small></button>)}<button disabled={workspaceUploading} onClick={() => { setConfigOpen(null); directoryInputRef.current?.click(); }}>{workspaceUploading ? t('importing') : t("+ Add workspace")}</button><button onClick={() => { setConfigOpen(null); setWorkspaceOpen(true); void browseDirectory(); }}>{t("Browse server folders")}</button></div>}</div><div className="config-menu"><button className={`model-selector companion-toggle${companionVisible ? ' is-active' : ''}`} onClick={() => { setCompanionVisible(true); setCompanionChatOpen(true); }} title={t("Aemeath is ready to help")}><Sparkles size={15} /><span>Aemeath</span></button></div></div>{customProviderOpen && <div className="modal-backdrop"><div className="config-modal provider-modal"><div className="model-panel-head"><span className="popover-title">{t("Custom providers")}</span><button className="icon-button" onClick={() => setCustomProviderOpen(false)}><X size={15} /></button></div><div className="provider-list">{providers.map(provider => <div className="provider-row" key={provider.id}><div><strong>{provider.name}</strong><small>{provider.baseUrl || t("Built-in provider")}</small></div><div className="provider-row-actions"><button type="button" onClick={() => { setProviderId(provider.id); setCustomProviderOpen(false); }}>{provider.id === providerId ? t("Workspace") : t("Use")}</button>{provider.id !== 'openai' && provider.id !== 'mock' && <button type="button" onClick={() => void removeProvider(provider.id)}>{t('cancel')}</button>}</div></div>)}</div><form className="provider-form" onSubmit={addProvider}><div className="popover-title">{t('add_provider')}</div><input name="name" placeholder={t('provider_name')} required /><input name="baseUrl" placeholder={t('endpoint')} type="url" required /><input name="apiKey" placeholder={t('api_key')} type="password" /><input name="id" placeholder={t("ID (auto from name if empty)")} /><div className="modal-actions"><button type="button" onClick={() => setCustomProviderOpen(false)}>{t('cancel')}</button><button type="submit">{t('connect_provider')}</button></div></form></div></div>}</header>
      {configOpen === 'model' && <div className="modal-backdrop"><div className="config-modal model-modal" role="dialog" aria-label={t("Select a model")}>
        <div className="model-panel-head"><span className="popover-title">{t('select_model')}</span><button className="icon-button" onClick={() => { setConfigOpen(null); setModelSearch(''); }}><X size={15} /></button></div>
        <label className="model-search"><Search size={14} /><input autoFocus value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder={t('Search models by name or id')} /><span className="model-count">{filteredModels.length}</span></label>
        <div className="model-list" ref={modelListRef} onScroll={event => { const element = event.currentTarget; if (element.scrollTop + element.clientHeight >= element.scrollHeight - 60) loadMoreModels(); }}>{modelsLoading && <div className="model-hint">{t('loading_models')}</div>}{!modelsLoading && filteredModels.length === 0 && <div className="model-hint">No models match \u201c{modelSearch}\u201d</div>}{visibleModels.map(model => <button type="button" key={`${model.provider}:${model.id}`} className={model.id === modelId ? 'selected' : ''} onClick={() => { setModelId(model.id); setProviderId(model.provider); setConfigOpen(null); setModelSearch(''); }}><span className="model-name">{model.name}</span><small>{model.id} \u00b7 {model.provider}</small></button>)}{filteredModels.length > visibleModels.length && <div className="model-more"><span>{t('showing_models')} {visibleModels.length} / {filteredModels.length}</span><button type="button" onClick={loadMoreModels}>{t('load_more')}</button></div>}</div>
        <div className="model-panel-foot"><button type="button" onClick={() => { setConfigOpen(null); setCustomProviderOpen(true); }}><Settings size={13} /> {t('Manage custom providers')}</button></div>
      </div></div>}

      {workspaceOpen && <div className="modal-backdrop"><div className="config-modal browser-modal"><div className="popover-title">{t("Browse server folders")}</div><div className="browser-path">{browserPath ?? 'Loading…'}</div><div className="browser-entries">{browserEntries.map(entry => <button key={entry.path} onClick={() => void browseDirectory(entry.path)}><FolderOpen size={14} /> {entry.name}</button>)}</div>{browserError && <div className="browser-error">{browserError}</div>}<div className="modal-actions">{browserParent && <button type="button" onClick={() => void browseDirectory(browserParent)}>{t('up')}</button>}<button type="button" onClick={() => setWorkspaceOpen(false)}>{t('cancel')}</button><button type="button" onClick={useBrowsedFolder} disabled={!browserPath}>{t('use_folder')}</button></div></div></div>}<input ref={directoryInputRef} className="directory-picker" type="file" multiple {...({ webkitdirectory: 'true' } as Record<string, string>)} onChange={chooseWorkspaceFolder} />{notice && <button className="notice" onClick={() => setNotice('')}>{notice}<X size={13} /></button>}
      <section className="conversation">
        {(!active || active.messages.length === 0) ? (
          <div className="empty-state-container">
            <div className="hero-header">
              <span className="hero-logo"><AstraLogo size={52} /></span>
              <h1>{t("How can I help you today?")}</h1>
            </div>
            <div className="aemeath-presence-strip">
          <button className="aemeath-presence-face" onClick={() => setCompanionVisible(value => !value)} title={companionVisible ? 'Hide Aemeath' : 'Show Aemeath'}>
            <span className={`rig-presence-core state-${companionState}`} />
          </button>
          <span className="aemeath-presence-text">{companionSpeech ?? companionGoalLine(activeGoal(companionGoals)) ?? companionDetail ?? t("Aemeath is ready to help")}</span>
          <span className="aemeath-presence-bond">{companionBondSummary(companionBond)}</span>
        </div>
        <div className="center-composer">

      <form onSubmit={submit} style={{ width: '100%' }}>
        <div className="composer">
          <textarea value={input} onChange={event => { setInput(event.target.value); if (event.target.value.trim() && companionState === 'idle') { setCompanionState('listening'); setCompanionDetail('Listening'); } }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(event); } }} placeholder={t("Message Astra or type /goal ...")} rows={3} />
          <div className="composer-actions">
            <div className="composer-left-actions">
              <button type="button" className="icon-btn" onClick={() => directoryInputRef.current?.click()} title={t("+ Add workspace")}>
                <Paperclip size={18} />
              </button>
<div className="composer-menu"><button type="button" className="pill-btn" onClick={() => setConfigOpen(configOpen === 'mode' ? null : 'mode')}>{mode === 'code' ? <Code2 size={14} /> : mode === 'research' ? <Search size={14} /> : mode === 'self-heal' ? <Terminal size={14} /> : <Sparkles size={14} />} {mode === 'code' ? t("Code") : mode === 'research' ? 'Research' : 'Chat'} <ChevronDown size={13} /></button>{configOpen === 'mode' && <div className="composer-popover"><div className="popover-title">Mode</div>{(['chat', 'code', 'research', 'self-heal'] as const).map(value => <button type="button" key={value} className={mode === value ? 'selected' : ''} onClick={() => { setMode(value); setConfigOpen(null); }}>{value === 'code' ? t("Code") : value === 'research' ? 'Research' : 'Chat'}<small>{value === 'code' ? t('Inspect and modify workspace code.') : value === 'research' ? t('Analyze context and compare options.') : value === 'self-heal' ? t('Fix internal compilation errors automatically.') : t('General conversation and assistance.')}</small></button>)}</div>}</div><div className="composer-menu"><button type="button" className="pill-btn model-pill" ref={modelTriggerRef} onClick={() => setConfigOpen(configOpen === 'model' ? null : 'model')}><Bot size={14} /> {selectedModel?.name ?? modelId} <ChevronDown size={13} /></button></div>
            </div>
            <div className="composer-right-actions">
              <span className="model-indicator"><span className="status-dot" /> {busy ? t("Working") : t("Ready")}</span>
              <button className="send-btn" type={busy ? 'button' : 'submit'} onClick={busy ? stop : undefined} disabled={!busy && !input.trim()}>
                {busy ? <Square size={14} /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
        <div className="composer-hint">{t("Astra can make mistakes. Check important code and decisions.")}</div>
      </form>

            </div>
            <div className="suggestions-container">
              <div className="suggestions">
                <button onClick={() => setInput('Write a focused implementation for this project')}><FileCode2 size={15} /> {t("Write")}</button>
                <button onClick={() => setInput('Teach me how this code works')}><Sparkles size={15} /> {t("Learn")}</button>
                <button onClick={() => { setMode('code'); setInput('Inspect this project and suggest a coding improvement'); }}><Code2 size={15} /> {t("Code")}</button>
                <button onClick={() => setInput('Analyze the architecture and identify risks')}><Search size={15} /> {t("Analyze")}</button>
                <button onClick={() => setInput('Brainstorm practical improvements for this project')}><Bot size={15} /> {t("Brainstorm")}</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="messages-container">
              {active.messages.map((message, index) => <article className={`message ${message.role}`} key={index}><div className="avatar">{message.role === 'assistant' ? <Sparkles size={15} /> : 'You'}</div><div className="message-body">{message.tool && <div className="tool-chip"><Terminal size={12} /> Using {message.tool}</div>}<div className="message-content">{renderContent(message.content || (busy && index === active.messages.length - 1 ? 'Thinking…' : ''))}</div>{message.status === 'done' && message.role === 'assistant' && <div className="verified"><Check size={12} /> Response complete</div>}</div></article>)}
            </div>
            <div className="composer-wrap sticky-bottom">

      <form onSubmit={submit} style={{ width: '100%' }}>
        <div className="composer">
          <textarea value={input} onChange={event => { setInput(event.target.value); if (event.target.value.trim() && companionState === 'idle') { setCompanionState('listening'); setCompanionDetail('Listening'); } }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(event); } }} placeholder={t("Message Astra or type /goal ...")} rows={3} />
          <div className="composer-actions">
            <div className="composer-left-actions">
              <button type="button" className="icon-btn" onClick={() => directoryInputRef.current?.click()} title={t("+ Add workspace")}>
                <Paperclip size={18} />
              </button>
<div className="composer-menu"><button type="button" className="pill-btn" onClick={() => setConfigOpen(configOpen === 'mode' ? null : 'mode')}>{mode === 'code' ? <Code2 size={14} /> : mode === 'research' ? <Search size={14} /> : mode === 'self-heal' ? <Terminal size={14} /> : <Sparkles size={14} />} {mode === 'code' ? t("Code") : mode === 'research' ? 'Research' : 'Chat'} <ChevronDown size={13} /></button>{configOpen === 'mode' && <div className="composer-popover"><div className="popover-title">Mode</div>{(['chat', 'code', 'research', 'self-heal'] as const).map(value => <button type="button" key={value} className={mode === value ? 'selected' : ''} onClick={() => { setMode(value); setConfigOpen(null); }}>{value === 'code' ? t("Code") : value === 'research' ? 'Research' : 'Chat'}<small>{value === 'code' ? t('Inspect and modify workspace code.') : value === 'research' ? t('Analyze context and compare options.') : value === 'self-heal' ? t('Fix internal compilation errors automatically.') : t('General conversation and assistance.')}</small></button>)}</div>}</div><div className="composer-menu"><button type="button" className="pill-btn model-pill" ref={modelTriggerRef} onClick={() => setConfigOpen(configOpen === 'model' ? null : 'model')}><Bot size={14} /> {selectedModel?.name ?? modelId} <ChevronDown size={13} /></button></div>
            </div>
            <div className="composer-right-actions">
              <span className="model-indicator"><span className="status-dot" /> {busy ? t("Working") : t("Ready")}</span>
              <button className="send-btn" type={busy ? 'button' : 'submit'} onClick={busy ? stop : undefined} disabled={!busy && !input.trim()}>
                {busy ? <Square size={14} /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
        <div className="composer-hint">{t("Astra can make mistakes. Check important code and decisions.")}</div>
      </form>

            </div>
          </>
        )}
      </section>
      {activity.length > 0 && <div className="activity-bar"><Terminal size={14} /> {activity.length} tool action{activity.length > 1 ? 's' : ''} completed</div>}

    </main>
      <CompanionDock
        state={companionState}
        detail={companionDetail}
        speech={companionSpeech}
        visible={companionVisible}
        onVisibleChange={setCompanionVisible}
        chatOpen={companionChatOpen}
        onChatOpenChange={setCompanionChatOpen}
        reducedMotion={false}
        scale={companionScale}
        onScaleChange={setCompanionScale}
        position={{ x: -1, y: 96 }}
        onPositionChange={setCompanionPosition}
        personalityEnabled={companionPersonality}
        onPersonalityChange={setCompanionPersonality}
        useArtwork={companionArtwork}
        onUseArtworkChange={setCompanionArtwork}
        calm={companionCalm}
        onCalmChange={setCompanionCalm}
        activity={companionActivity}
        liveStatus={busy ? companionDetail : undefined}
        sidebarCollapsed={!sidebarOpen}
        chatMode={companionChatMode}
        onChatModeChange={setCompanionChatMode}
        onAsk={askAemeath}
        suggestions={liveSuggestions}
        memories={companionMemory.entries}
        bondSummary={companionBondSummary(companionBond)}
        familiarity={companionBond.familiarity}
        goal={activeGoal(companionGoals)}
        attentionLevel={attentionLevel}
        routines={openRoutines(companionRoutines)}
        onCompleteRoutine={id => setCompanionRoutines(current => completeRoutine(current, id))}
        onRemoveRoutine={id => setCompanionRoutines(current => removeRoutine(current, id))}
        voice={companionVoice}
        voices={COMPANION_VOICES}
        onVoiceChange={setCompanionVoice}
        onForgetMemory={id => setCompanionMemory(current => forget(current, id))}
        onForgetAllMemories={() => setCompanionMemory(forgetAll())}
        onRunTool={runCompanionTool}
        onDelegate={prompt => {
          setInput(prompt);
          setNotice('Aemeath handed the task to Astra.');
          setCompanionState('planning');
          setCompanionDetail('Handing over to Astra');
        }}
      />
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider><App /></I18nProvider></React.StrictMode>);
