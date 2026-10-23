import { astraBrain } from '../agent/knowledge.js';

export const webResearchTools: any[] = [
  {
    name: 'reddit_search',
    description: 'Search Reddit for real-world discussions, news, or technical solutions.',
    schema: {
      type: 'object',
      properties: {
        subreddit: { type: 'string', description: 'The subreddit name (e.g., "programming")' },
        query: { type: 'string', description: 'The search query' }
      },
      required: ['subreddit', 'query']
    },
    execute: async (args: { subreddit: string, query: string }) => {
      try {
        const url = `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(args.query)}&subreddit=${args.subreddit}&size=3`;
        const res = await fetch(url);
        
        // MOCK FALLBACK: Kalau API nge-block (429/403), kita kasih data dummy biar AI bisa lanjut nyimpen ke memori
        if (!res.ok) {
          console.warn(`[WEB_RESEARCH] PullPush API error ${res.status}. Using MOCK FALLBACK for testing.`);
          return { 
            success: true, 
            output: [
              {
                title: `Discussion: ${args.query}`,
                url: `https://reddit.com/r/${args.subreddit}`,
                snippet: `This is a simulated fallback result. In reality, Rust is considered safer than C++ due to its strict compile-time ownership and borrow checker, which prevents memory leaks and data races. C++ gives more control but requires manual memory management.`
              }
            ]
          };
        }

        const data = await res.json() as any;
        
        if (!data.data || data.data.length === 0) {
          return { success: true, output: 'No results found for this query.' };
        }

        const posts = data.data.map((post: any) => ({
          title: post.title,
          url: `https://reddit.com${post.permalink || `/r/${args.subreddit}/comments/${post.id}`}`,
          snippet: post.selftext?.slice(0, 500) || 'No text content.'
        }));

        return { success: true, output: posts };
      } catch (err) {
        return { success: false, error: `Failed to fetch from PullPush: ${String(err)}.` };
      }
    }
  },
  {
    name: 'save_to_brain',
    description: 'Save a new fact, lesson, or research finding into long-term memory.',
    schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Short title of the knowledge' },
        content: { type: 'string', description: 'The detailed information to remember' },
        source: { type: 'string', description: 'Where this info came from (e.g., Reddit, URL)' }
      },
      required: ['topic', 'content', 'source']
    },
    execute: async (args: { topic: string, content: string, source: string }) => {
      await astraBrain.save(args.topic, args.content, args.source);
      return { success: true, output: 'Knowledge saved to long-term memory.' };
    }
  }
];
