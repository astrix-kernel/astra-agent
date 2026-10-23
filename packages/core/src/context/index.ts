import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Dirent } from 'node:fs';

export interface ContextHit { path: string; score: number; content: string; reason: string; }
const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache']);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.c', '.h', '.cpp', '.cc', '.java', '.md', '.json', '.yaml', '.yml', '.toml']);

export async function discoverInstructions(root: string): Promise<ContextHit[]> {
  const names = ['AGENTS.md', 'ASTRA.md', 'CLAUDE.md', 'README.md', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'];
  const hits: ContextHit[] = [];
  for (const name of names) { try { const content = await fs.readFile(path.join(root, name), 'utf8'); hits.push({ path: name, score: 100, content: content.slice(0, 12000), reason: 'project instruction or manifest' }); } catch { continue; } }
  return hits;
}

const MAX_FILES = 300;
const MAX_DIRECTORIES = 600;

async function collectFiles(root: string, current: string, output: string[], budget: { directories: number }): Promise<void> {
  if (output.length >= MAX_FILES || budget.directories <= 0) return;
  budget.directories -= 1;
  let entries: Dirent[];
  try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (output.length >= MAX_FILES || budget.directories <= 0) return;
    if (ignored.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) await collectFiles(root, full, output, budget);
    else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) output.push(path.relative(root, full));
  }
}

export async function retrieveProjectContext(root: string, query: string, maxFiles = 8, maxChars = 24000): Promise<ContextHit[]> {
  const instructionHits = await discoverInstructions(root);
  const files: string[] = []; await collectFiles(root, root, files, { directories: MAX_DIRECTORIES });
  const terms = query.toLowerCase().split(/[^a-z0-9_:-]+/).filter(term => term.length > 2);
  const scored = files.map(file => { const lower = file.toLowerCase(); const score = terms.reduce((total, term) => total + (lower.includes(term) ? 5 : 0), 0) + (['src', 'lib', 'app', 'test', 'tests'].some(part => lower.includes(`${part}/`)) ? 1 : 0); return { file, score }; }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  const hits: ContextHit[] = [...instructionHits]; let used = instructionHits.reduce((n, hit) => n + hit.content.length, 0);
  for (const candidate of scored.slice(0, maxFiles * 3)) {
    if (hits.length >= maxFiles || used >= maxChars) break;
    try { const content = await fs.readFile(path.join(root, candidate.file), 'utf8'); const clipped = content.slice(0, Math.min(6000, maxChars - used)); hits.push({ path: candidate.file, score: candidate.score, content: clipped, reason: candidate.score > 0 ? 'query-matched path' : 'relevant project source' }); used += clipped.length; } catch { continue; }
  }
  return hits;
}
