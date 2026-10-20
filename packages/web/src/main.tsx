import type { FormEvent } from 'react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, Bot, Check, ChevronDown, Code2, FileCode2, FolderOpen, Menu, MessageSquarePlus, Paperclip, Search, Send, Settings, Sparkles, Square, Terminal, X } from 'lucide-react';
import { CustomizationPage } from './customization.js';
import './styles.css';

interface Message { role: 'user' | 'assistant'; content: string; tool?: string; status?: 'working' | 'done' | 'error' }
interface Chat { id: string; title: string; messages: Message[]; updatedAt: number }
interface Customization { depth: 'balanced' | 'deep' | 'systems'; autoContext: boolean; verifyAfterChanges: boolean; explainDecisions: boolean; safeWrites: boolean; }
const STORAGE_KEY = 'astra.chats.v1';
const SETTINGS_KEY = 'astra.customization.v1';
const defaultCustomization: Customization = { depth: 'deep', autoContext: true, verifyAfterChanges: true, explainDecisions: true, safeWrites: false };

function renderContent(content: string) {
  return content.split(/(```[\\s\\S]*?```)/g).map((part, index) => part.startsWith('```') ? <pre key={index}><code>{part.replace(/^```[a-z]*\\n?|```$/g, '')}</code></pre> : <span key={index}>{part}</span>);
}

function App() {
  const [chats, setChats] = useState<Chat[]>(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Chat[]; } catch { return []; } });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState<string[]>([]);
  const [mode, setMode] = useState<'chat' | 'code' | 'research'>('chat');
  const [notice, setNotice] = useState('');
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [settings, setSettings] = useState<Customization>(() => { try { return { ...defaultCustomization, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Customization> }; } catch { return defaultCustomization; } });
  const abortRef = useRef<AbortController | null>(null);
  const active = chats.find(chat => chat.id === activeId);
  const visibleChats = useMemo(() => chats.filter(chat => chat.title.toLowerCase().includes(search.toLowerCase())), [chats, search]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, 30))); }, [chats]);
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); createChat(); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);
  const createChat = () => { const chat = { id: crypto.randomUUID(), title: 'New conversation', messages: [], updatedAt: Date.now() }; setChats(current => [chat, ...current]); setActiveId(chat.id); setActivity([]); };
  const updateActive = (fn: (chat: Chat) => Chat) => setChats(current => current.map(chat => chat.id === activeId ? fn(chat) : chat));
  const stop = () => { abortRef.current?.abort(); abortRef.current = null; setBusy(false); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const text = input.trim(); if (!text || busy) return;
    let chatId = activeId; if (!chatId) { const chat = { id: crypto.randomUUID(), title: text.slice(0, 42), messages: [], updatedAt: Date.now() }; setChats(current => [chat, ...current]); chatId = chat.id; setActiveId(chatId); }
    setInput(''); setBusy(true); setActivity([]);
    const user: Message = { role: 'user', content: text }; const assistant: Message = { role: 'assistant', content: '', status: 'working' };
    setChats(current => current.map(chat => chat.id === chatId ? { ...chat, title: chat.messages.length ? chat.title : text.slice(0, 42), messages: [...chat.messages, user, assistant], updatedAt: Date.now() } : chat));
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: `${text}\n\nAstra customization: reasoning=${settings.depth}; autoContext=${settings.autoContext}; verifyAfterChanges=${settings.verifyAfterChanges}; explainDecisions=${settings.explainDecisions}; safeWrites=${settings.safeWrites}`, workspaceRoot: '.', allowWrite: settings.safeWrites }), signal: controller.signal });
      const result = await response.json() as { events?: { type: string; text?: string; tool?: string; error?: string }[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Request failed');
      for (const item of result.events ?? []) {
        if (item.type === 'text') updateActive(chat => ({ ...chat, messages: chat.messages.map((message, index) => index === chat.messages.length - 1 ? { ...message, content: message.content + (item.text ?? '') } : message) }));
        if (item.type === 'tool_start') { setActivity(current => [...current, item.tool ?? 'tool']); updateActive(chat => ({ ...chat, messages: chat.messages.map((message, index) => index === chat.messages.length - 1 && item.tool ? { ...message, tool: item.tool } : message) })); }
        if (item.type === 'error') updateActive(chat => ({ ...chat, messages: chat.messages.map((message, index) => index === chat.messages.length - 1 ? { ...message, content: `${message.content}\\n\\n${item.error ?? 'Unknown error'}`, status: 'error' } : message) }));
        if (item.type === 'done') updateActive(chat => ({ ...chat, messages: chat.messages.map((message, index) => index === chat.messages.length - 1 ? { ...message, status: 'done' } : message) }));
      }
    } catch (error) { if ((error as Error).name !== 'AbortError') updateActive(chat => ({ ...chat, messages: chat.messages.map((message, index) => index === chat.messages.length - 1 ? { ...message, content: `Unable to reach Astra API: ${error instanceof Error ? error.message : String(error)}`, status: 'error' } : message) })); }
    finally { setBusy(false); abortRef.current = null; }
  };
  if (customizationOpen) return <CustomizationPage onClose={() => setCustomizationOpen(false)} />;
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? '' : 'closed'}`}>
      <div className="brand"><span className="brand-mark"><Sparkles size={17} strokeWidth={2.4} /></span><span>Astra</span><button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)}><X size={16} /></button></div>
      <button className="new-chat" onClick={createChat}><MessageSquarePlus size={16} /> New chat <span className="shortcut">⌘ K</span></button>
      <label className="search-box"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search conversations" /></label>
      <nav className="primary-nav"><button onClick={createChat}><MessageSquarePlus size={16} /> New chat</button><button onClick={() => setNotice('Projects are scoped to the current workspace.')}><FolderOpen size={16} /> Projects</button><button onClick={() => setNotice('Artifacts will appear here after the agent creates one.')}><Archive size={16} /> Artifacts</button><button onClick={() => setMode('code')}><Code2 size={16} /> Code</button><button className={customizationOpen ? 'active' : ''} onClick={() => setCustomizationOpen(value => !value)}><Settings size={16} /> Customization</button></nav>
      <div className="section-label">Recent conversations</div><nav className="chat-list">{visibleChats.map(chat => <button className={chat.id === activeId ? 'selected' : ''} key={chat.id} onClick={() => { setActiveId(chat.id); setActivity([]); }}><span>{chat.title}</span><small>{new Date(chat.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></button>)}</nav>
      <div className="sidebar-footer"><span className="status-dot" /> Local workspace<div className="provider-note">Live model status is shown in the header</div></div>
    </aside>
    {customizationOpen && <aside className="customization-panel"><div className="panel-heading"><div><span className="eyebrow">ASTRA CONTROL CENTER</span><h2>Customization</h2></div><button className="icon-button" onClick={() => setCustomizationOpen(false)}><X size={16} /></button></div><p className="panel-intro">Tune how Astra reasons about code, research, and system-level problems.</p><label className="setting-label">Reasoning depth<select value={settings.depth} onChange={event => setSettings(current => ({ ...current, depth: event.target.value as Customization['depth'] }))}><option value="balanced">Balanced · faster</option><option value="deep">Deep · recommended</option><option value="systems">Systems · maximum detail</option></select></label><div className="setting-group"><span className="setting-label">Coding intelligence</span><label className="toggle-row"><input type="checkbox" checked={settings.autoContext} onChange={event => setSettings(current => ({ ...current, autoContext: event.target.checked }))} /><span>Inspect relevant files automatically</span></label><label className="toggle-row"><input type="checkbox" checked={settings.verifyAfterChanges} onChange={event => setSettings(current => ({ ...current, verifyAfterChanges: event.target.checked }))} /><span>Verify changes with tests and diagnostics</span></label><label className="toggle-row"><input type="checkbox" checked={settings.explainDecisions} onChange={event => setSettings(current => ({ ...current, explainDecisions: event.target.checked }))} /><span>Explain decisions and trade-offs</span></label><label className="toggle-row"><input type="checkbox" checked={settings.safeWrites} onChange={event => setSettings(current => ({ ...current, safeWrites: event.target.checked }))} /><span>Allow workspace writes</span></label></div><div className="capability-grid"><span>Code tracing</span><span>Test recovery</span><span>Systems reasoning</span><span>Security checks</span></div><button className="reset-button" onClick={() => setSettings(defaultCustomization)}>Reset defaults</button></aside>}
    <main className="workspace"><header className="topbar"><button className="icon-button" onClick={() => setSidebarOpen(value => !value)}><Menu size={18} /></button><span className="workspace-title">{active?.title ?? 'Astra'}</span><div className="topbar-spacer" /><span className="model-status"><span className="status-dot" /> {busy ? 'Working' : 'Ready'}</span><button className="model-selector"><Bot size={15} /> {mode === 'code' ? 'Coding mode' : 'Astra model'} <ChevronDown size={14} /></button></header>
      {notice && <button className="notice" onClick={() => setNotice('')}>{notice}<X size={13} /></button>}
      <section className="conversation">{!active || active.messages.length === 0 ? <div className="welcome"><div className="eyebrow">ASTRA AGENT AI</div><h1>How can I help you today?</h1><p>Ask Astra to write, learn, code, analyze, or brainstorm with you.</p><div className="suggestions"><button onClick={() => setInput('Write a focused implementation for this project')}><FileCode2 size={15} /> Write</button><button onClick={() => setInput('Teach me how this code works')}><Sparkles size={15} /> Learn</button><button onClick={() => { setMode('code'); setInput('Inspect this project and suggest a coding improvement'); }}><Code2 size={15} /> Code</button><button onClick={() => setInput('Analyze the architecture and identify risks')}><Search size={15} /> Analyze</button><button onClick={() => setInput('Brainstorm practical improvements for this project')}><Bot size={15} /> Brainstorm</button></div></div> : active.messages.map((message, index) => <article className={`message ${message.role}`} key={index}><div className="avatar">{message.role === 'assistant' ? <Sparkles size={15} /> : 'You'}</div><div className="message-body">{message.tool && <div className="tool-chip"><Terminal size={12} /> Using {message.tool}</div>}<div className="message-content">{renderContent(message.content || (busy && index === active.messages.length - 1 ? 'Thinking…' : ''))}</div>{message.status === 'done' && message.role === 'assistant' && <div className="verified"><Check size={12} /> Response complete</div>}</div></article>)}</section>
      {activity.length > 0 && <div className="activity-bar"><Terminal size={14} /> {activity.length} tool action{activity.length > 1 ? 's' : ''} completed</div>}
      <form className="composer-wrap" onSubmit={submit}><div className="composer"><div className="composer-toolbar"><button type="button" className="composer-icon" onClick={() => setNotice('Attachment support is scoped to workspace files.')} title="Attach file"><Paperclip size={16} /></button><button type="button" className={`mode-selector ${mode !== 'chat' ? 'active' : ''}`} onClick={() => setMode(mode === 'chat' ? 'code' : 'chat')}>{mode === 'code' ? <Code2 size={14} /> : <Sparkles size={14} />} {mode === 'code' ? 'Code' : 'Chat'} <ChevronDown size={13} /></button></div><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(event); } }} placeholder="Message Astra" rows={2} /><div className="composer-bottom"><span className="composer-context">Workspace context · {mode === 'code' ? 'coding mode' : 'default mode'}</span><button className="send-button" type={busy ? 'button' : 'submit'} onClick={busy ? stop : undefined} disabled={!busy && !input.trim()}>{busy ? <Square size={16} /> : <Send size={16} />}</button></div></div><div className="composer-hint">Astra can make mistakes. Check important code and decisions. · Shift + Enter for a new line</div></form>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
