import neo4j, { Driver, Session } from 'neo4j-driver';

const NEO4J_URI = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env['NEO4J_USER'] ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'astra-knowledge-2026';

let driver: Driver | null = null;
function getDriver(): Driver {
  if (!driver) driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  return driver;
}
async function withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
  const s = getDriver().session();
  try { return await fn(s); } finally { await s.close(); }
}
async function resolveCodebaseId(session: Session, requestedId?: string): Promise<string | null> {
  if (requestedId) return requestedId;
  const r = await session.run(`MATCH (cb:Codebase) RETURN cb.id AS id LIMIT 2`);
  if (r.records.length === 1) return r.records[0]!.get('id');
  if (r.records.length === 0) return null;
  throw new Error('Multiple codebases indexed. Specify codebaseId.');
}

export const kernelBrainTools: any[] = [
  {
    name: 'kernel_list_codebases',
    description: 'List all indexed codebases in Neo4j.',
    schema: { type: 'object', properties: {} },
    execute: async () => withSession(async (s) => {
      const r = await s.run(`MATCH (cb:Codebase) RETURN cb.id AS id, cb.name AS name, cb.rootPath AS root ORDER BY cb.name`);
      return { success: true, output: r.records.map(rec => ({ id: rec.get('id'), name: rec.get('name'), root: rec.get('root') })) };
    }),
  },
  {
    name: 'kernel_find_function',
    description: 'Find a function definition with return type, params, file, line, and doc comment.',
    schema: { type: 'object', properties: { name: { type: 'string' }, codebaseId: { type: 'string' } }, required: ['name'] },
    execute: async (args: any) => withSession(async (s) => {
      const cbId = await resolveCodebaseId(s, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebase indexed.' };
      const r = await s.run(
        `MATCH (file:File)-[:DEFINES]->(f:Function {codebaseId: $cbId, name: $name})
         RETURN f.name AS name, f.returnType AS returnType, f.parameters AS parameters,
                f.doc AS doc, f.isStatic AS isStatic, f.line AS line, file.relativePath AS filePath LIMIT 10`,
        { cbId, name: args.name }
      );
      if (r.records.length === 0) return { success: true, output: `Function "${args.name}" not found.` };
      return { success: true, output: r.records.map(rec => ({
        name: rec.get('name'), returnType: rec.get('returnType'), parameters: rec.get('parameters'),
        doc: rec.get('doc'), isStatic: rec.get('isStatic'), line: rec.get('line'), filePath: rec.get('filePath'),
      })) };
    }),
  },
  {
    name: 'kernel_get_function_full',
    description: 'Get complete info about a function: definition, doc, callers, callees, used structs, used macros.',
    schema: { type: 'object', properties: { name: { type: 'string' }, codebaseId: { type: 'string' } }, required: ['name'] },
    execute: async (args: any) => withSession(async (s) => {
      const cbId = await resolveCodebaseId(s, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebase indexed.' };
      const def = await s.run(
        `MATCH (file:File)-[:DEFINES]->(f:Function {codebaseId: $cbId, name: $name})
         RETURN f.name AS name, f.returnType AS returnType, f.parameters AS parameters,
                f.doc AS doc, f.isStatic AS isStatic, f.line AS line, file.relativePath AS filePath LIMIT 1`,
        { cbId, name: args.name }
      );
      if (def.records.length === 0) return { success: true, output: `Function "${args.name}" not found.` };
      const row = def.records[0]!;
      const callers = await s.run(
        `MATCH (c:Function {codebaseId: $cbId})-[:CALLS]->(t:Function {name: $name})
         OPTIONAL MATCH (file:File)-[:DEFINES]->(c)
         RETURN DISTINCT c.name AS caller, file.relativePath AS filePath, c.line AS line LIMIT 50`,
        { cbId, name: args.name }
      );
      const callees = await s.run(
        `MATCH (c:Function {codebaseId: $cbId, name: $name})-[:CALLS]->(t:Function)
         RETURN DISTINCT t.name AS callee LIMIT 50`,
        { cbId, name: args.name }
      );
      const uses = await s.run(
        `MATCH (c:Function {codebaseId: $cbId, name: $name})-[:USES]->(x)
         RETURN DISTINCT labels(x)[0] AS kind, x.name AS name LIMIT 50`,
        { cbId, name: args.name }
      );
      return { success: true, output: {
        definition: {
          name: row.get('name'), returnType: row.get('returnType'),
          parameters: row.get('parameters'), doc: row.get('doc'),
          isStatic: row.get('isStatic'), line: row.get('line'), filePath: row.get('filePath'),
        },
        callers: callers.records.map(r => ({ caller: r.get('caller'), filePath: r.get('filePath'), line: r.get('line') })),
        callees: callees.records.map(r => r.get('callee')),
        uses: uses.records.map(r => ({ kind: r.get('kind'), name: r.get('name') })),
      } };
    }),
  },
  {
    name: 'kernel_find_callers',
    description: 'Find callers of a single function.',
    schema: { type: 'object', properties: { name: { type: 'string' }, codebaseId: { type: 'string' } }, required: ['name'] },
    execute: async (args: any) => withSession(async (s) => {
      const cbId = await resolveCodebaseId(s, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebase.' };
      const r = await s.run(
        `MATCH (c:Function {codebaseId: $cbId})-[:CALLS]->(t:Function {name: $name})
         OPTIONAL MATCH (f:File)-[:DEFINES]->(c)
         RETURN DISTINCT c.name AS caller, f.relativePath AS filePath, c.line AS line LIMIT 100`,
        { cbId, name: args.name }
      );
      return { success: true, output: r.records.map(rec => ({ caller: rec.get('caller'), filePath: rec.get('filePath'), line: rec.get('line') })) };
    }),
  },
  {
    name: 'kernel_find_callers_batch',
    description: 'Find callers for MULTIPLE functions in ONE call. Use when checking many functions at once.',
    schema: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } }, codebaseId: { type: 'string' } }, required: ['names'] },
    execute: async (args: any) => withSession(async (s) => {
      const cbId = await resolveCodebaseId(s, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebase.' };
      const r = await s.run(
        `MATCH (c:Function {codebaseId: $cbId})-[:CALLS]->(t:Function)
         WHERE t.name IN $names
         OPTIONAL MATCH (f:File)-[:DEFINES]->(c)
         RETURN DISTINCT t.name AS target, c.name AS caller, f.relativePath AS filePath, c.line AS line
         ORDER BY target, caller`,
        { cbId, names: args.names }
      );
      const grouped: Record<string, any[]> = {};
      for (const rec of r.records) {
        const tgt = rec.get('target');
        if (!grouped[tgt]) grouped[tgt] = [];
        grouped[tgt].push({ caller: rec.get('caller'), filePath: rec.get('filePath'), line: rec.get('line') });
      }
      return { success: true, output: grouped };
    }),
  },
  {
    name: 'kernel_find_callees',
    description: 'Find callees of a function.',
    schema: { type: 'object', properties: { name: { type: 'string' }, codebaseId: { type: 'string' } }, required: ['name'] },
    execute: async (args: any) => withSession(async (s) => {
      const cbId = await resolveCodebaseId(s, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebase.' };
      const r = await s.run(
        `MATCH (c:Function {codebaseId: $cbId, name: $name})-[:CALLS]->(t:Function)
         RETURN DISTINCT t.name AS callee ORDER BY callee`,
        { cbId, name: args.name }
      );
      return { success: true, output: r.records.map(rec => rec.get('callee')) };
    }),
  },
  {
    name: 'kernel_find_users_of_struct',
    description: 'Find all functions that USE a specific struct type (via USES relation).',
    schema: { type: 'object', properties: { structName: { type: 'string' }, codebaseId: { type: 'string' } }, required: ['structName'] },
    execute: async (args: any) => withSession(async (s) => {
      const cbId = await resolveCodebaseId(s, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebase.' };
      const r = await s.run(
        `MATCH (f:Function {codebaseId: $cbId})-[:USES]->(st) WHERE st.name = $structName AND (st:Struct OR st:Typedef)
         OPTIONAL MATCH (file:File)-[:DEFINES]->(f)
         RETURN DISTINCT f.name AS fn, file.relativePath AS filePath, f.line AS line
         ORDER BY fn LIMIT 100`,
        { cbId, structName: args.structName }
      );
      return { success: true, output: r.records.map(rec => ({ function: rec.get('fn'), filePath: rec.get('filePath'), line: rec.get('line') })) };
    }),
  },
  {
    name: 'kernel_search_comments',
    description: 'Full-text search in function names AND doc comments. Great for finding functions by description.',
    schema: { type: 'object', properties: { query: { type: 'string' }, codebaseId: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
    execute: async (args: any) => withSession(async (s) => {
      const cbId = await resolveCodebaseId(s, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebase.' };
      const limit = args.limit ?? 15;
      const r = await s.run(
        `CALL db.index.fulltext.queryNodes('function_comment_search', $query)
         YIELD node, score
         WHERE node.codebaseId = $cbId
         OPTIONAL MATCH (f:File)-[:DEFINES]->(node)
         RETURN node.name AS name, node.doc AS doc, node.returnType AS returnType,
                f.relativePath AS filePath, node.line AS line, score
         ORDER BY score DESC LIMIT toInteger($limit)`,
        { cbId, query: args.query, limit }
      );
      return { success: true, output: r.records.map(rec => ({
        name: rec.get('name'), doc: rec.get('doc'), returnType: rec.get('returnType'),
        filePath: rec.get('filePath'), line: rec.get('line'), score: rec.get('score'),
      })) };
    }),
  },
  {
    name: 'kernel_search',
    description: 'Substring search in function/struct/macro/typedef/global names.',
    schema: {
      type: 'object',
      properties: {
        term: { type: 'string' },
        type: { type: 'string', enum: ['function', 'struct', 'macro', 'typedef', 'global', 'all'], default: 'all' },
        codebaseId: { type: 'string' },
      },
      required: ['term'],
    },
    execute: async (args: any) => withSession(async (s) => {
      const cbId = await resolveCodebaseId(s, args.codebaseId);
      if (!cbId) return { success: false, error: 'No codebase.' };
      const type = args.type ?? 'all';
      const results: any = {};
      const term = args.term;
      if (type === 'function' || type === 'all') {
        const r = await s.run(
          `MATCH (f:Function {codebaseId: $cbId}) WHERE toLower(f.name) CONTAINS toLower($term)
           RETURN f.name AS name, f.returnType AS returnType, f.doc AS doc LIMIT 30`,
          { cbId, term }
        );
        results.functions = r.records.map(rec => ({ name: rec.get('name'), returnType: rec.get('returnType'), doc: rec.get('doc') }));
      }
      if (type === 'struct' || type === 'all') {
        const r = await s.run(
          `MATCH (st:Struct {codebaseId: $cbId}) WHERE toLower(st.name) CONTAINS toLower($term)
           RETURN st.name AS name, st.fields AS fields LIMIT 30`,
          { cbId, term }
        );
        results.structs = r.records.map(rec => ({ name: rec.get('name'), fields: rec.get('fields') }));
      }
      if (type === 'macro' || type === 'all') {
        const r = await s.run(
          `MATCH (m:Macro {codebaseId: $cbId}) WHERE toLower(m.name) CONTAINS toLower($term)
           RETURN m.name AS name, m.value AS value LIMIT 30`,
          { cbId, term }
        );
        results.macros = r.records.map(rec => ({ name: rec.get('name'), value: rec.get('value') }));
      }
      if (type === 'typedef' || type === 'all') {
        const r = await s.run(
          `MATCH (t:Typedef {codebaseId: $cbId}) WHERE toLower(t.name) CONTAINS toLower($term)
           RETURN t.name AS name, t.underlying AS underlying LIMIT 30`,
          { cbId, term }
        );
        results.typedefs = r.records.map(rec => ({ name: rec.get('name'), underlying: rec.get('underlying') }));
      }
      if (type === 'global' || type === 'all') {
        const r = await s.run(
          `MATCH (g:Global {codebaseId: $cbId}) WHERE toLower(g.name) CONTAINS toLower($term)
           RETURN g.name AS name, g.type AS type, g.isStatic AS isStatic LIMIT 30`,
          { cbId, term }
        );
        results.globals = r.records.map(rec => ({ name: rec.get('name'), type: rec.get('type'), isStatic: rec.get('isStatic') }));
      }
      return { success: true, output: results };
    }),
  },
];
