import { randomUUID } from 'node:crypto';

export interface WorkingMemoryEntry {
  id: string;
  taskId: string;
  type: 'fact' | 'goal' | 'constraint' | 'finding' | 'decision' | 'error' | 'question' | 'hypothesis' | 'verified_fact' | 'file_path' | 'command' | 'test_result' | 'build_result';
  content: string;
  source: 'user' | 'model' | 'tool' | 'file' | 'inference' | 'retrieval';
  toolName?: string;
  filePath?: string;
  confidence: number;
  timestamp: number;
  relatedEntries: string[];
}

export interface WorkingMemory {
  taskId: string;
  objective: string;
  entries: WorkingMemoryEntry[];
  currentStep: string;
  completedSteps: string[];
  pendingSteps: string[];
  openQuestions: string[];
  hypotheses: string[];
  errors: string[];
  verifiedFacts: string[];
  importantFiles: string[];
  importantCommands: string[];
  lastUpdated: number;
}

export interface WorkingMemoryStore {
  get(taskId: string): WorkingMemory | undefined;
  set(taskId: string, memory: WorkingMemory): void;
  delete(taskId: string): void;
  addEntry(taskId: string, entry: Omit<WorkingMemoryEntry, 'id' | 'timestamp'>): WorkingMemoryEntry;
  updateEntry(taskId: string, entryId: string, updates: Partial<WorkingMemoryEntry>): boolean;
  getEntries(taskId: string, type?: WorkingMemoryEntry['type']): WorkingMemoryEntry[];
}

export class InMemoryWorkingMemoryStore implements WorkingMemoryStore {
  private memories = new Map<string, WorkingMemory>();

  get(taskId: string): WorkingMemory | undefined {
    return this.memories.get(taskId);
  }

  set(taskId: string, memory: WorkingMemory): void {
    this.memories.set(taskId, memory);
  }

  delete(taskId: string): void {
    this.memories.delete(taskId);
  }

  addEntry(taskId: string, entry: Omit<WorkingMemoryEntry, 'id' | 'timestamp'>): WorkingMemoryEntry {
    const memory = this.memories.get(taskId);
    if (!memory) {
      throw new Error(`Working memory not found for task ${taskId}`);
    }
    const newEntry: WorkingMemoryEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: Date.now(),
    };
    memory.entries.push(newEntry);
    memory.lastUpdated = Date.now();
    return newEntry;
  }

  updateEntry(taskId: string, entryId: string, updates: Partial<WorkingMemoryEntry>): boolean {
    const memory = this.memories.get(taskId);
    if (!memory) return false;
    const entry = memory.entries.find(e => e.id === entryId);
    if (!entry) return false;
    Object.assign(entry, updates);
    memory.lastUpdated = Date.now();
    return true;
  }

  getEntries(taskId: string, type?: WorkingMemoryEntry['type']): WorkingMemoryEntry[] {
    const memory = this.memories.get(taskId);
    if (!memory) return [];
    if (type) return memory.entries.filter(e => e.type === type);
    return [...memory.entries];
  }
}

export function createWorkingMemory(taskId: string, objective: string): WorkingMemory {
  return {
    taskId,
    objective,
    entries: [],
    currentStep: '',
    completedSteps: [],
    pendingSteps: [],
    openQuestions: [],
    hypotheses: [],
    errors: [],
    verifiedFacts: [],
    importantFiles: [],
    importantCommands: [],
    lastUpdated: Date.now(),
  };
}

export function formatWorkingMemoryForPrompt(memory: WorkingMemory, maxEntries = 20): string {
  const sections: string[] = [];
  
  if (memory.objective) {
    sections.push(`OBJECTIVE: ${memory.objective}`);
  }
  
  if (memory.currentStep) {
    sections.push(`CURRENT STEP: ${memory.currentStep}`);
  }
  
  if (memory.completedSteps.length > 0) {
    sections.push(`COMPLETED STEPS:\n${memory.completedSteps.map(s => `- ${s}`).join('\n')}`);
  }
  
  if (memory.pendingSteps.length > 0) {
    sections.push(`PENDING STEPS:\n${memory.pendingSteps.map(s => `- ${s}`).join('\n')}`);
  }
  
  if (memory.verifiedFacts.length > 0) {
    sections.push(`VERIFIED FACTS:\n${memory.verifiedFacts.map(f => `- ${f}`).join('\n')}`);
  }
  
  if (memory.importantFiles.length > 0) {
    sections.push(`IMPORTANT FILES:\n${memory.importantFiles.map(f => `- ${f}`).join('\n')}`);
  }
  
  if (memory.importantCommands.length > 0) {
    sections.push(`IMPORTANT COMMANDS:\n${memory.importantCommands.map(c => `- ${c}`).join('\n')}`);
  }
  
  if (memory.errors.length > 0) {
    sections.push(`RECENT ERRORS:\n${memory.errors.map(e => `- ${e}`).join('\n')}`);
  }
  
  if (memory.openQuestions.length > 0) {
    sections.push(`OPEN QUESTIONS:\n${memory.openQuestions.map(q => `- ${q}`).join('\n')}`);
  }
  
  const recentEntries = memory.entries
    .slice(-maxEntries)
    .map(e => `[${e.type.toUpperCase()}] ${e.content} (confidence: ${e.confidence.toFixed(1)})`)
    .join('\n');
  
  if (recentEntries) {
    sections.push(`RECENT MEMORY ENTRIES:\n${recentEntries}`);
  }
  
  return sections.join('\n\n');
}

export function extractMemoryFromToolResult(
  toolName: string,
  result: unknown
): Omit<WorkingMemoryEntry, 'id' | 'timestamp' | 'taskId'>[] {
  const entries: Omit<WorkingMemoryEntry, 'id' | 'timestamp' | 'taskId'>[] = [];
  
  if (toolName === 'fs.read' || toolName === 'fs.list' || toolName === 'fs.grep' || toolName === 'code.search') {
    const content = result as { success: boolean; output?: unknown };
    if (content.success && content.output) {
      entries.push({
        type: 'finding',
        content: `Read from ${toolName}: ${JSON.stringify(content.output).slice(0, 500)}`,
        source: 'tool',
        toolName,
        confidence: 0.9,
        relatedEntries: [],
      });
    }
  }
  
  if (toolName === 'fs.write' || toolName === 'fs.patch' || toolName === 'fs.delete' || toolName === 'fs.move') {
    const content = result as { success: boolean; output?: { path?: string } };
    if (content.success && content.output?.path) {
      entries.push({
        type: 'file_path',
        content: `Modified file: ${content.output.path}`,
        source: 'tool',
        toolName,
        filePath: content.output.path,
        confidence: 1.0,
        relatedEntries: [],
      });
    }
  }
  
  if (toolName === 'terminal.execute') {
    const content = result as { success: boolean; output?: { stdout?: string; stderr?: string; exitCode?: number } };
    if (content.success && content.output) {
      entries.push({
        type: 'command',
        content: `Executed command: ${JSON.stringify(content.output).slice(0, 500)}`,
        source: 'tool',
        toolName,
        confidence: 0.8,
        relatedEntries: [],
      });
      if (content.output.exitCode !== 0) {
        entries.push({
          type: 'error',
          content: `Command failed with exit code ${content.output.exitCode}: ${content.output.stderr?.slice(0, 300)}`,
          source: 'tool',
          toolName,
          confidence: 0.9,
          relatedEntries: [],
        });
      }
    }
  }
  
  if (toolName === 'verify.run') {
    const content = result as { success: boolean; output?: { stdout?: string; stderr?: string; exitCode?: number } };
    if (content.success && content.output) {
      entries.push({
        type: content.output.exitCode === 0 ? 'test_result' : 'error',
        content: `Verification result: exitCode=${content.output.exitCode}, stdout=${content.output.stdout?.slice(0, 500)}, stderr=${content.output.stderr?.slice(0, 300)}`,
        source: 'tool',
        toolName,
        confidence: 0.95,
        relatedEntries: [],
      });
    }
  }
  
  return entries;
}

export function extractMemoryFromFileRead(
  filePath: string
): Omit<WorkingMemoryEntry, 'id' | 'timestamp' | 'taskId'> {
  return {
    type: 'file_path',
    content: `Read file: ${filePath}`,
    source: 'file',
    filePath,
    confidence: 1.0,
    relatedEntries: [],
  };
}