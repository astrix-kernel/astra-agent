import { astraBrain } from '../agent/knowledge.js';

const TECH_SOURCES = {
  github: 'https://api.github.com/search/repositories',
  arxiv: 'http://export.arxiv.org/api/query',
  nvidiaDev: 'https://developer.nvidia.com/blog',
  amdDev: 'https://www.amd.com/en/developer',
  kernelOrg: 'https://www.kernel.org',
  rustLang: 'https://doc.rust-lang.org',
  cudaDocs: 'https://docs.nvidia.com/cuda',
  rocmDocs: 'https://docs.amd.com/category/rocM',
  tensorrtDocs: 'https://docs.nvidia.com/deeplearning/tensorrt',
  pytorchDocs: 'https://pytorch.org/docs',
  huggingface: 'https://huggingface.co/docs',
};

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export const webResearchTools = [
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
        const res = await fetchWithTimeout(url);
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
        const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'AstraAgent/1.0' } });
        
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
    name: 'github_search',
    description: 'Search GitHub for repositories, code, issues, and discussions. Great for finding implementations, libraries, and examples.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "flash attention cuda", "tensorrt plugin example")' },
        type: { type: 'string', enum: ['repositories', 'code', 'issues', 'topics'], default: 'repositories' },
        language: { type: 'string', description: 'Programming language filter (e.g., "cuda", "cpp", "python", "rust")' },
        stars: { type: 'string', description: 'Minimum stars filter (e.g., ">100")' },
      },
      required: ['query']
    },
    execute: async (args: { query: string; type?: string; language?: string; stars?: string }) => {
      try {
        let searchQuery = args.query;
        if (args.language) searchQuery += ` language:${args.language}`;
        if (args.stars) searchQuery += ` stars:${args.stars}`;
        
        const url = `https://api.github.com/search/${args.type || 'repositories'}?q=${encodeURIComponent(searchQuery)}&sort=stars&order=desc&per_page=5`;
        const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AstraAgent/1.0' } });
        
        if (!res.ok) {
          if (res.status === 403) {
            return { success: true, output: 'GitHub API rate limited. Try again later or use other search tools.' };
          }
          return { success: false, error: `GitHub API error: ${res.status}` };
        }
        
        const data = await res.json() as any;
        if (!data.items || data.items.length === 0) {
          return { success: true, output: 'No GitHub results found.' };
        }
        
        const results = data.items.slice(0, 5).map((item: any) => ({
          title: item.full_name || item.name,
          url: item.html_url,
          description: item.description,
          stars: item.stargazers_count,
          language: item.language,
          updated: item.updated_at,
          type: args.type || 'repositories',
        }));
        
        return { success: true, output: results };
      } catch (err) {
        return { success: false, error: `GitHub search failed: ${String(err)}` };
      }
    }
  },
  {
    name: 'arxiv_search',
    description: 'Search arXiv for latest research papers in AI, ML, systems, GPU computing, and computer science.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "flash attention", "mixture of experts", "cuda optimization")' },
        category: { type: 'string', description: 'arXiv category (e.g., "cs.LG", "cs.DC", "cs.AR", "stat.ML")' },
        maxResults: { type: 'number', default: 5, minimum: 1, maximum: 20 },
      },
      required: ['query']
    },
    execute: async (args: { query: string; category?: string; maxResults?: number }) => {
      try {
        let searchQuery = `all:${encodeURIComponent(args.query)}`;
        if (args.category) searchQuery += `+AND+cat:${args.category}`;
        
        const url = `${TECH_SOURCES.arxiv}?search_query=${searchQuery}&start=0&max_results=${args.maxResults || 5}&sortBy=relevance&sortOrder=descending`;
        const res = await fetchWithTimeout(url);
        
        if (!res.ok) return { success: false, error: `arXiv API error: ${res.status}` };
        
        const xml = await res.text();
        const entries = xml.split('<entry>').slice(1);
        
        const results = entries.map((entry: string) => {
          const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
          const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
          const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
          const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);
          const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => m[1]);
          const categories = [...entry.matchAll(/term="([^"]*)"/g)].map(m => m[1]);
          
          return {
            title: titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || 'Unknown',
            summary: summaryMatch?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 500) || '',
            url: idMatch?.[1]?.replace('http://arxiv.org/abs/', 'https://arxiv.org/abs/') || '',
            published: publishedMatch?.[1] || '',
            authors: authors.slice(0, 3),
            categories: categories,
          };
        });
        
        return { success: true, output: results };
      } catch (err) {
        return { success: false, error: `arXiv search failed: ${String(err)}` };
      }
    }
  },
  {
    name: 'tech_docs_search',
    description: 'Search technical documentation for CUDA, ROCm, TensorRT, PyTorch, Rust, Linux Kernel, and other technical docs.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Technical query (e.g., "cudaMallocAsync", "tensorrt plugin api", "linux kernel rcu")' },
        source: { type: 'string', enum: ['cuda', 'rocm', 'tensorrt', 'pytorch', 'huggingface', 'rust', 'kernel', 'all'], default: 'all' },
      },
      required: ['query']
    },
    execute: async (args: { query: string; source?: string }) => {
      try {
        const sources = args.source === 'all' 
          ? Object.keys(TECH_SOURCES).filter(k => !['github', 'arxiv', 'nvidiaDev', 'amdDev', 'kernelOrg'].includes(k))
          : [args.source];
        
        const results: any[] = [];
        
        for (const source of sources) {
          const baseUrl = TECH_SOURCES[source as keyof typeof TECH_SOURCES];
          if (!baseUrl) continue;
          
          try {
            let searchUrl = '';
            if (source === 'cuda') searchUrl = `https://docs.nvidia.com/cuda/search.html?q=${encodeURIComponent(args.query)}`;
            else if (source === 'rocm') searchUrl = `https://docs.amd.com/search.html?q=${encodeURIComponent(args.query)}`;
            else if (source === 'tensorrt') searchUrl = `https://docs.nvidia.com/deeplearning/tensorrt/search.html?q=${encodeURIComponent(args.query)}`;
            else if (source === 'pytorch') searchUrl = `https://pytorch.org/search/?q=${encodeURIComponent(args.query)}`;
            else if (source === 'huggingface') searchUrl = `https://huggingface.co/search?q=${encodeURIComponent(args.query)}`;
            else if (source === 'rust') searchUrl = `https://doc.rust-lang.org/search.html?q=${encodeURIComponent(args.query)}`;
            else if (source === 'kernel') searchUrl = `https://elixir.bootlin.com/linux/latest/source/search?q=${encodeURIComponent(args.query)}`;
            
            if (searchUrl) {
              results.push({
                source,
                title: `${(source || 'Unknown').toUpperCase()} Documentation: ${args.query}`,
                url: searchUrl,
                snippet: `Search ${source} documentation for "${args.query}"`,
              });
            }
          } catch {
            // Ignore individual source errors
          }
        }
        
        if (results.length === 0) {
          return { success: true, output: 'No documentation sources available for this query.' };
        }
        
        return { success: true, output: results };
      } catch (err) {
        return { success: false, error: `Tech docs search failed: ${String(err)}` };
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
    execute: async (args: { subreddit: string; query: string }) => {
      try {
        const url = `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(args.query)}&subreddit=${args.subreddit}&size=3`;
        const res = await fetchWithTimeout(url);
        if (!res.ok) {
          return { success: false, error: `Reddit API error: ${res.status}. Use wikipedia_search or duckduckgo_search instead.` };
        }
        const data = await res.json() as any;
        if (!data.data || data.data.length === 0) return { success: true, output: 'No Reddit results.' };
        const posts = data.data.map((post: any) => ({
          title: post.title,
          url: `https://reddit.com${post.permalink || ''}`,
          snippet: post.selftext?.slice(0, 500) || 'No text.',
          score: post.score,
          comments: post.num_comments,
        }));
        return { success: true, output: posts };
      } catch (err) {
        return { success: false, error: `Reddit fetch failed: ${String(err)}` };
      }
    }
  },
  {
    name: 'stackoverflow_search',
    description: 'Search Stack Overflow for programming questions and answers.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Technical question or topic' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter (e.g., ["cuda", "c++", "pytorch"])' },
      },
      required: ['query']
    },
    execute: async (args: { query: string; tags?: string[] }) => {
      try {
        let url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(args.query)}&site=stackoverflow&pagesize=5`;
        if (args.tags && args.tags.length > 0) {
          url += `&tagged=${args.tags.join(';')}`;
        }
        
        const res = await fetchWithTimeout(url);
        if (!res.ok) return { success: false, error: `Stack Overflow API error: ${res.status}` };
        
        const data = await res.json() as any;
        if (!data.items || data.items.length === 0) {
          return { success: true, output: 'No Stack Overflow results found.' };
        }
        
        const results = data.items.map((item: any) => ({
          title: item.title,
          url: item.link,
          score: item.score,
          answerCount: item.answer_count,
          tags: item.tags,
          isAnswered: item.is_answered,
          snippet: item.excerpt?.replace(/<[^>]*>?/gm, '').slice(0, 300) || '',
        }));
        
        return { success: true, output: results };
      } catch (err) {
        return { success: false, error: `Stack Overflow search failed: ${String(err)}` };
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
    execute: async (args: { topic: string; content: string; source: string }) => {
      await astraBrain.save(args.topic, args.content, args.source);
      return { success: true, output: 'Knowledge saved to long-term memory.' };
    }
  },
  {
    name: 'recall_from_brain',
    description: 'Recall previously saved knowledge from long-term memory.',
    schema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
      },
      required: ['topic']
    },
    execute: async (args: { topic: string }) => {
      const memories = await astraBrain.search(args.topic);
      if (memories.length === 0) {
        return { success: true, output: `No memories found for topic: ${args.topic}` };
      }
      return { success: true, output: memories };
    }
  },
];

export default webResearchTools;