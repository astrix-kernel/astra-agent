import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface KnowledgeEntry {
  id: string;
  topic: string;
  content: string;
  source: string;
  timestamp: number;
}

const DB_PATH = path.join(process.cwd(), '.astra', 'knowledge.json');

export class KnowledgeBase {
  private entries: KnowledgeEntry[] = [];

  async init() {
    try {
      await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
      const data = await fs.readFile(DB_PATH, 'utf-8');
      this.entries = JSON.parse(data);
    } catch {
      this.entries = [];
    }
  }

  async save(topic: string, content: string, source: string) {
    // Cek apakah topik ini udah pernah disimpen
    const existingIndex = this.entries.findIndex(e => e.topic.toLowerCase() === topic.toLowerCase());
    
    if (existingIndex !== -1) {
      // Kalau udah ada, cuma update isinya (biar gak duplikat)
      const existing = this.entries[existingIndex] as KnowledgeEntry;
      const updatedEntry: KnowledgeEntry = {
        id: existing.id,
        topic: existing.topic,
        content,
        source,
        timestamp: Date.now()
      };
      this.entries[existingIndex] = updatedEntry;
      await fs.writeFile(DB_PATH, JSON.stringify(this.entries, null, 2));
      return updatedEntry;
    }

    // Kalau belum ada, bikin baru
    const newEntry: KnowledgeEntry = {
      id: randomUUID(),
      topic,
      content,
      source,
      timestamp: Date.now()
    };
    this.entries.push(newEntry);
    await fs.writeFile(DB_PATH, JSON.stringify(this.entries, null, 2));
    return newEntry;
  }

  search(query: string): string {
    const keywords = query.toLowerCase().split(' ').filter(w => w.length > 3);
    if (keywords.length === 0) return 'No specific keywords for memory search.';
    
    const hits = this.entries.filter(e => 
      keywords.some(k => e.topic.toLowerCase().includes(k) || e.content.toLowerCase().includes(k))
    ).slice(-5);
    
    if (hits.length === 0) return 'No prior knowledge found on this topic.';
    
    return hits.map(h => `[Source: ${h.source}] ${h.topic}:\n${h.content}`).join('\n\n');
  }
}

export const astraBrain = new KnowledgeBase();
