import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type WebCategory = string;

export interface WebFact {
  id: string;
  topic: string;
  fact: string;
  source: string;
  sourceUrl?: string;
  confidence: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_CATEGORIES = [
  'wikipedia',
  'github',
  'reddit',
  'stackoverflow',
  'arxiv',
  'general',
];

export class WebBrain {
  private basePath: string;
  private facts: Map<string, WebFact[]> = new Map();
  private loaded = false;

  constructor(basePath?: string) {
    const envPath = process.env['ASTRA_WEB_BRAIN_PATH'];
    this.basePath =
      basePath ??
      envPath ??
      path.join(process.cwd(), '.astra', 'brains', 'web');
  }

  async init(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(this.basePath, { recursive: true });
    for (const category of DEFAULT_CATEGORIES) {
      await this.loadCategory(category);
    }
    try {
      const entries = await fs.readdir(this.basePath);
      for (const file of entries) {
        if (!file.endsWith('.json')) continue;
        const category = file.replace(/\.json$/, '');
        if (!this.facts.has(category)) await this.loadCategory(category);
      }
    } catch {
      // basePath might be empty on first run
    }
    this.loaded = true;
  }

  private async loadCategory(category: string): Promise<void> {
    const filePath = path.join(this.basePath, `${category}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      this.facts.set(category, JSON.parse(data) as WebFact[]);
    } catch {
      this.facts.set(category, []);
    }
  }

  private async saveCategory(category: string): Promise<void> {
    const filePath = path.join(this.basePath, `${category}.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const list = this.facts.get(category) ?? [];
    await fs.writeFile(filePath, JSON.stringify(list, null, 2));
  }

  private inferCategory(source: string): string {
    const s = source.toLowerCase();
    if (s.includes('wikipedia')) return 'wikipedia';
    if (s.includes('github')) return 'github';
    if (s.includes('reddit')) return 'reddit';
    if (s.includes('stackoverflow') || s.includes('stack overflow') || s.includes('stack-overflow')) return 'stackoverflow';
    if (s.includes('arxiv')) return 'arxiv';
    return 'general';
  }

  async remember(input: {
    topic: string;
    fact: string;
    source: string;
    category?: string;
    sourceUrl?: string;
    confidence?: number;
    tags?: string[];
  }): Promise<WebFact> {
    await this.init();
    const category = input.category ?? this.inferCategory(input.source);
    if (!this.facts.has(category)) this.facts.set(category, []);
    const list = this.facts.get(category)!;

    const existing = list.find(
      (f) => f.topic.toLowerCase() === input.topic.toLowerCase()
    );
    if (existing) {
      existing.fact = input.fact;
      existing.source = input.source;
      if (input.sourceUrl) existing.sourceUrl = input.sourceUrl;
      if (input.confidence !== undefined) existing.confidence = input.confidence;
      if (input.tags) existing.tags = input.tags;
      existing.updatedAt = Date.now();
      await this.saveCategory(category);
      return existing;
    }

    const newFact: WebFact = {
      id: randomUUID(),
      topic: input.topic,
      fact: input.fact,
      source: input.source,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      confidence: input.confidence ?? 0.8,
      tags: input.tags ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    list.push(newFact);
    await this.saveCategory(category);
    return newFact;
  }

  recall(
    query: string,
    options: { category?: string; limit?: number; minConfidence?: number } = {}
  ): WebFact[] {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (keywords.length === 0) return [];

    const limit = options.limit ?? 10;
    const minConf = options.minConfidence ?? 0;
    const categories = options.category
      ? [options.category]
      : Array.from(this.facts.keys());

    const results: { fact: WebFact; score: number }[] = [];

    for (const cat of categories) {
      for (const fact of this.facts.get(cat) ?? []) {
        if (fact.confidence < minConf) continue;
        const haystack = `${fact.topic} ${fact.fact} ${fact.tags.join(' ')}`.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (haystack.includes(kw)) score += 1;
        }
        if (score > 0) results.push({ fact, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.fact);
  }

  stats(): {
    totalFacts: number;
    categories: Record<string, number>;
    totalTags: number;
    basePath: string;
  } {
    let total = 0;
    const categories: Record<string, number> = {};
    const tags = new Set<string>();
    for (const [cat, facts] of this.facts) {
      categories[cat] = facts.length;
      total += facts.length;
      for (const f of facts) f.tags.forEach((t) => tags.add(t));
    }
    return {
      totalFacts: total,
      categories,
      totalTags: tags.size,
      basePath: this.basePath,
    };
  }

  listCategories(): { category: string; count: number }[] {
    return Array.from(this.facts.entries()).map(([c, f]) => ({
      category: c,
      count: f.length,
    }));
  }

  async migrateFromLegacy(filePath: string): Promise<number> {
    await this.init();
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const entries = JSON.parse(data) as Array<{
        id?: string;
        topic: string;
        content?: string;
        fact?: string;
        source: string;
        timestamp?: number;
      }>;
      let count = 0;
      for (const entry of entries) {
        const fact = entry.content ?? entry.fact ?? '';
        if (!entry.topic || !fact) continue;
        await this.remember({
          topic: entry.topic,
          fact,
          source: entry.source,
          confidence: 0.7,
        });
        count++;
      }
      return count;
    } catch {
      return 0;
    }
  }
}

export const astraWebBrain = new WebBrain();
