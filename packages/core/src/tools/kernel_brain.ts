import neo4j, { Driver, Session } from 'neo4j-driver';

const NEO4J_URI = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env['NEO4J_USER'] ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'astra-knowledge-2026';

let driver: Driver | null = null;

function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  }
  return driver;
}

async function withSession<T>(fn: (session: Session) => Promise<T>): Promise<T> {
  const s = getDriver().session();
  try { return await fn(s); } finally { await s.close(); }
}

async function resolveCodebaseId(session: Session, requestedId?: string): Promise<string | null> {
  if (requestedId) return requestedId;
  const r = await session.run(`MATCH (cb:Codebase) RETURN cb.id AS id LIMIT 2`);
  if (r.records.length === 1) return r.records[0]!.get('id');
  if (r.records.length === 0) return null;
  throw new Error('Multiple codebases indexed. Please specify codebaseId explicitly.');
}

export const kernelBrainTools: any[] = [
  {
    name: 'kernel_list_codebases',
    description: 'List all codebases indexed in the kernel knowledge graph (Neo4j).',
    schema: { type: 'object', properties: {} },
    execute: async () => withSession(async (session) => {
      const r = await session.run(
        `MATCH (cb:Codebase) RETURN cb.id AS id, cb.name AS name, cb.rootPath AS root ORDER BY cb.name`
      );
      return {
        success: true,
        output: r.records.map(rec => ({
          id: rec.get('id'), name: rec.get('name'), root: rec.get('root'),
        })),
      };
    }),
  },
  {
    name: 'kernel_find_function',
    description: 'Find a C/C++ function definition in the indexed kernel codebase. Returns return type, parameters, file path, and line number.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact function name' },
        codebaseId: { type: 'string', description: 'Optional if only one codebase indexed' },
      },
      required: ['name'],
    },
    execute: async (args: { name: string; codebaseId?: string }) => withSession(async (session) => {
      const cbId = await resolveCodebaseId(session, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebases indexed. Run indexer first.' };
      const r = await session.run(
        `MATCH (f:Function {codebaseId: $cbId, name: $name})
         OPTIONAL MATCH (file:File)-[:DEFINES]->(f)
         RETURN f.name AS name, f.returnType AS returnType, f.parameters AS parameters,
                f.line AS line, file.relativePath AS filePath LIMIT 10`,
        { cbId, name: args.name }
      );
      if (r.records.length === 0) return { success: true, output: `Function "${args.name}" not found.` };
      return { success: true, output: r.records.map(rec => ({
        name: rec.get('name'), returnType: rec.get('returnType'),
        parameters: rec.get('parameters'), line: rec.get('line'), filePath: rec.get('filePath'),
      })) };
    }),
  },
  {
    name: 'kernel_find_callers',
    description: 'Find all functions that call the given function in the kernel codebase.',
    schema: {
      type: 'object',
      properties: { name: { type: 'string' }, codebaseId: { type: 'string' } },
      required: ['name'],
    },
    execute: async (args: { name: string; codebaseId?: string }) => withSession(async (session) => {
      const cbId = await resolveCodebaseId(session, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebases indexed.' };
      const r = await session.run(
        `MATCH (caller:Function {codebaseId: $cbId})-[:CALLS]->(target:Function {name: $name})
         OPTIONAL MATCH (file:File)-[:DEFINES]->(caller)
         RETURN DISTINCT caller.name AS caller, file.relativePath AS filePath, caller.line AS line
         ORDER BY caller LIMIT 100`,
        { cbId, name: args.name }
      );
      return { success: true, output: r.records.map(rec => ({
        caller: rec.get('caller'), filePath: rec.get('filePath'), line: rec.get('line'),
      })) };
    }),
  },
  {
    name: 'kernel_find_callees',
    description: 'Find all functions that the given function calls in the kernel codebase.',
    schema: {
      type: 'object',
      properties: { name: { type: 'string' }, codebaseId: { type: 'string' } },
      required: ['name'],
    },
    execute: async (args: { name: string; codebaseId?: string }) => withSession(async (session) => {
      const cbId = await resolveCodebaseId(session, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebases indexed.' };
      const r = await session.run(
        `MATCH (caller:Function {codebaseId: $cbId, name: $name})-[:CALLS]->(callee:Function)
         RETURN DISTINCT callee.name AS callee ORDER BY callee`,
        { cbId, name: args.name }
      );
      return { success: true, output: r.records.map(rec => rec.get('callee')) };
    }),
  },
  {
    name: 'kernel_search',
    description: 'Search the indexed kernel codebase for functions, structs, or macros matching a term (case-insensitive substring).',
    schema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Search term' },
        type: { type: 'string', enum: ['function', 'struct', 'macro', 'all'], default: 'all' },
        codebaseId: { type: 'string' },
      },
      required: ['term'],
    },
    execute: async (args: { term: string; type?: string; codebaseId?: string }) => withSession(async (session) => {
      const cbId = await resolveCodebaseId(session, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebases indexed.' };
      const type = args.type ?? 'all';
      const results: any = {};
      if (type === 'function' || type === 'all') {
        const r = await session.run(
          `MATCH (f:Function {codebaseId: $cbId}) WHERE toLower(f.name) CONTAINS toLower($term)
           RETURN f.name AS name, f.returnType AS returnType LIMIT 20`,
          { cbId, term: args.term }
        );
        results.functions = r.records.map(rec => ({ name: rec.get('name'), returnType: rec.get('returnType') }));
      }
      if (type === 'struct' || type === 'all') {
        const r = await session.run(
          `MATCH (s:Struct {codebaseId: $cbId}) WHERE toLower(s.name) CONTAINS toLower($term)
           RETURN s.name AS name, s.fields AS fields LIMIT 20`,
          { cbId, term: args.term }
        );
        results.structs = r.records.map(rec => ({ name: rec.get('name'), fields: rec.get('fields') }));
      }
      if (type === 'macro' || type === 'all') {
        const r = await session.run(
          `MATCH (m:Macro {codebaseId: $cbId}) WHERE toLower(m.name) CONTAINS toLower($term)
           RETURN m.name AS name, m.value AS value LIMIT 20`,
          { cbId, term: args.term }
        );
        results.macros = r.records.map(rec => ({ name: rec.get('name'), value: rec.get('value') }));
      }
      return { success: true, output: results };
    }),
  },
];
