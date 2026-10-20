import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface SkillRecord { id: string; name: string; description: string; category: string; publisher: string; builtin: boolean; installed: boolean; enabled: boolean; instructions?: string; source?: string; }
const builtinSkills: SkillRecord[] = [
  { id: 'coding', name: 'coding', description: 'Implement focused changes, trace dependencies, preserve conventions, and verify results.', category: 'Coding', publisher: 'Astra', builtin: true, installed: true, enabled: true, instructions: 'Inspect relevant files first. Make the smallest justified change. Run targeted verification and report evidence.' },
  { id: 'debugging', name: 'debugging', description: 'Diagnose failures with reproducible hypotheses, targeted experiments, and regression tests.', category: 'Debugging', publisher: 'Astra', builtin: true, installed: true, enabled: true, instructions: 'Reproduce the issue, isolate the cause, test the hypothesis, then add or update regression coverage.' },
  { id: 'systems-reasoning', name: 'systems-reasoning', description: 'Reason across application, runtime, operating system, kernel, and hardware layers.', category: 'Engineering', publisher: 'Astra', builtin: true, installed: true, enabled: true, instructions: 'State assumptions, identify abstraction layers, trace the causal path, and distinguish guarantees from implementation details.' },
  { id: 'research', name: 'research', description: 'Find authoritative sources, compare versions, and attach evidence to technical claims.', category: 'Research', publisher: 'Astra', builtin: true, installed: true, enabled: true, instructions: 'Prefer primary sources. Record version, provenance, uncertainty, and citations.' },
  { id: 'linux-kernel', name: 'linux-kernel', description: 'Investigate Linux kernel, drivers, syscalls, memory, scheduling, and tracing tasks.', category: 'Linux Kernel', publisher: 'Astra', builtin: true, installed: false, enabled: false, instructions: 'Use kernel documentation, source, man pages, and architecture manuals. Never invent symbols or guarantees.' },
  { id: 'data-analysis', name: 'data-analysis', description: 'Analyze datasets carefully with reproducible transformations, validation, and clear findings.', category: 'Data Analysis', publisher: 'Astra', builtin: true, installed: false, enabled: false },
];

export function listBuiltinSkills(): SkillRecord[] { return builtinSkills.map(skill => ({ ...skill })); }
export function skillMetadataForPrompt(skills: SkillRecord[]): string { return skills.filter(skill => skill.enabled && skill.instructions).map(skill => `Skill ${skill.name}: ${skill.description}\nInstructions: ${skill.instructions}`).join('\n\n'); }
export function parseSkillMarkdown(content: string, directoryName: string): SkillRecord {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) throw new Error('SKILL.md must contain YAML frontmatter');
  const frontmatter = match[1] ?? ''; const body = (match[2] ?? '').trim();
  const name = frontmatter.match(/^name:\s*([^\n]+)$/m)?.[1]?.trim(); const description = frontmatter.match(/^description:\s*([^\n]+)$/m)?.[1]?.trim();
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name !== directoryName) throw new Error('Invalid skill name; it must match the lowercase directory name');
  if (!description || description.length > 1024) throw new Error('Skill description is required and must be at most 1024 characters');
  return { id: name, name, description, category: 'Imported', publisher: 'Local', builtin: false, installed: false, enabled: false, instructions: body, source: 'imported' };
}
export async function loadSkillFromDirectory(directory: string): Promise<SkillRecord> { return parseSkillMarkdown(await fs.readFile(path.join(directory, 'SKILL.md'), 'utf8'), path.basename(directory)); }
