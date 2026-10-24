import { astraWebBrain } from '../agent/web-brain.js';

export const webBrainTools: any[] = [
  {
    name: 'web_remember',
    description:
      'Save a fact from the web (Wikipedia, GitHub, Reddit, StackOverflow, Arxiv, or general) into Astra structured web memory. Auto-deduplicates by topic.',
    schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Short topic title (e.g., "Rust ownership model")' },
        fact: { type: 'string', description: 'The fact, knowledge, or lesson to remember' },
        source: {
          type: 'string',
          description: 'Source name. Use: "wikipedia", "github", "reddit", "stackoverflow", "arxiv", or "general". You can add detail: "github:user/repo".',
        },
        sourceUrl: { type: 'string', description: 'Optional URL to the source' },
        confidence: { type: 'number', description: 'Confidence 0-1 (default 0.8)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for filtering' },
      },
      required: ['topic', 'fact', 'source'],
    },
    execute: async (args: any) => {
      try {
        const fact = await astraWebBrain.remember(args);
        return {
          success: true,
          output: { id: fact.id, topic: fact.topic, category: 'auto', confidence: fact.confidence },
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  {
    name: 'web_recall',
    description:
      'Search Astra structured web memory. Returns facts ranked by keyword relevance. Optionally filter by category (wikipedia/github/reddit/stackoverflow/arxiv/general).',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        category: { type: 'string', description: 'Optional: only search within this category' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        minConfidence: { type: 'number', description: 'Minimum confidence threshold 0-1' },
      },
      required: ['query'],
    },
    execute: async (args: any) => {
      try {
        await astraWebBrain.init();
        const results = astraWebBrain.recall(args.query, {
          category: args.category,
          limit: args.limit,
          minConfidence: args.minConfidence,
        });
        return { success: true, output: results };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  {
    name: 'web_stats',
    description:
      'Get statistics about Astra web memory: total facts, per-category counts, total unique tags, and storage path.',
    schema: { type: 'object', properties: {} },
    execute: async () => {
      try {
        await astraWebBrain.init();
        return { success: true, output: astraWebBrain.stats() };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
  {
    name: 'web_list_categories',
    description:
      'List all categories in Astra web memory with fact counts. Use this to know what domains Astra already knows about.',
    schema: { type: 'object', properties: {} },
    execute: async () => {
      try {
        await astraWebBrain.init();
        return { success: true, output: astraWebBrain.listCategories() };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },
];
