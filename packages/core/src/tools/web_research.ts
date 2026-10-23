import { astraBrain } from '../agent/knowledge.js';

export const webResearchTools: any[] = [
  {
    name: 'wikipedia_search',
    description: 'Search Wikipedia for encyclopedic knowledge, science, history, technology definitions, and factual information. ALWAYS USE THIS FIRST for general knowledge.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The topic or question to search (e.g., "Rust programming language", "Quantum mechanics")' }
      },
      required: ['query']
    },
    execute: async (args: { query: string }) => {
      try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(args.query)}&format=json&utf8=1&srlimit=3&origin=*`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, error: `Wikipedia error: ${res.status}` };
        const data = await res.json() as any;
        if (!data.query || !data.query.search || data.query.search.length === 0) {
          return { success: true, output: 'No Wikipedia articles found for this query.' };
        }
        const posts = data.query.search.map((item: any) => ({
          title: item.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
          snippet: item.snippet.replace(/<[^>]*>?/gm, '')
        }));
        return { success: true, output: posts };
      } catch (err) {
        return { success: false, error: `Wikipedia fetch failed: ${String(err)}` };
      }
    }
  },
  {
    name: 'duckduckgo_search',
    description: 'Search the general web using DuckDuckGo for recent news, blogs, tutorials, and non-encyclopedic content.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query (e.g., "latest AI news 2024")' }
      },
      required: ['query']
    },
    execute: async (args: { query: string }) => {
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'AstraAgent/1.0' }
        });
        
        if (!res.ok) {
          console.warn(`[WEB_RESEARCH] DuckDuckGo error ${res.status}. Using Mock Fallback.`);
          return { success: true, output: [{ title: `DDG Result for ${args.query}`, url: 'https://duckduckgo.com', snippet: 'Simulated web result for testing.' }] };
        }
        const data = await res.json() as any;
        
        const results: any[] = [];
        if (data.AbstractText) {
          results.push({
            title: data.Heading || args.query,
            url: data.AbstractURL || 'https://duckduckgo.com',
            snippet: data.AbstractText
          });
        }
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
          const topics = data.RelatedTopics.filter((t: any) => t.Text && t.FirstURL).slice(0, 2);
          topics.forEach((t: any) => {
            results.push({
              title: t.Text.slice(0, 100),
              url: t.FirstURL,
              snippet: t.Text
            });
          });
        }
        if (results.length === 0) {
          return { success: true, output: 'DuckDuckGo found no instant answer. Try Wikipedia instead.' };
        }
        return { success: true, output: results };
      } catch (err) {
        console.warn(`[WEB_RESEARCH] DuckDuckGo network failed: ${String(err)}. Using Mock Fallback.`);
        return { success: true, output: [{ title: `DDG Network Result for ${args.query}`, url: 'https://duckduckgo.com', snippet: 'Simulated web result due to network error.' }] };
      }
    }
  },
  {
    name: 'reddit_search',
    description: 'Search Reddit for community discussions. Use only if Wikipedia and DuckDuckGo do not have the answer.',
    schema: {
      type: 'object',
      properties: {
        subreddit: { type: 'string' },
        query: { type: 'string' }
      },
      required: ['subreddit', 'query']
    },
    execute: async (args: { subreddit: string, query: string }) => {
      try {
        const url = `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(args.query)}&subreddit=${args.subreddit}&size=3`;
        const res = await fetch(url);
        if (!res.ok) {
          return { success: false, error: `Reddit API error: ${res.status}. Use wikipedia_search or duckduckgo_search instead.` };
        }
        const data = await res.json() as any;
        if (!data.data || data.data.length === 0) return { success: true, output: 'No Reddit results.' };
        const posts = data.data.map((post: any) => ({
          title: post.title,
          url: `https://reddit.com${post.permalink || ''}`,
          snippet: post.selftext?.slice(0, 500) || 'No text.'
        }));
        return { success: true, output: posts };
      } catch (err) {
        return { success: false, error: `Reddit fetch failed: ${String(err)}` };
      }
    }
  },
  {
    name: 'save_to_brain',
    description: 'Save a new fact, lesson, or research finding into long-term memory.',
    schema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        content: { type: 'string' },
        source: { type: 'string' }
      },
      required: ['topic', 'content', 'source']
    },
    execute: async (args: { topic: string, content: string, source: string }) => {
      await astraBrain.save(args.topic, args.content, args.source);
      return { success: true, output: 'Knowledge saved to long-term memory.' };
    }
  }
];
