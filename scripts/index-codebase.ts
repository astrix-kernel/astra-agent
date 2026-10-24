import Parser from 'tree-sitter';
import C from 'tree-sitter-c';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const NEO4J_URI = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env['NEO4J_USER'] ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'astra-knowledge-2026';

interface ParsedFunction {
  name: string;
  returnType: string;
  parameters: string[];
  calls: string[];
  usesStructs: string[];
  usesMacros: string[];
  usesTypedefs: string[];
  doc: string | null;
  isStatic: boolean;
  line: number;
}
interface ParsedStruct { name: string; fields: { name: string; type: string }[]; doc: string | null; line: number; }
interface ParsedMacro { name: string; value: string; doc: string | null; line: number; }
interface ParsedTypedef { name: string; underlying: string; line: number; }
interface ParsedGlobal { name: string; type: string; isStatic: boolean; line: number; }
interface ParsedFile {
  path: string;
  functions: ParsedFunction[];
  structs: ParsedStruct[];
  macros: ParsedMacro[];
  typedefs: ParsedTypedef[];
  globals: ParsedGlobal[];
  includes: string[];
}

function extractDocComment(source: string, startLine: number): string | null {
  // Walk backward from startLine - 1, collect contiguous // or /** */ comment lines
  const lines = source.split('\n');
  let i = startLine - 1; // 0-indexed line just before start
  const collected: string[] = [];
  while (i >= 0) {
    const line = lines[i]?.trim() ?? '';
    if (!line) { if (collected.length === 0) { i--; continue; } else break; }
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/**') || line.startsWith('*/')) {
      collected.unshift(line.replace(/^\/\*\*?|\*\/?|\/\/\s?/g, '').trim());
      i--;
    } else if (line.endsWith('*/')) {
      collected.unshift(line.replace(/^\/\*\*?|\*\/?/g, '').trim());
      break;
    } else break;
  }
  const doc = collected.filter(Boolean).join(' ').trim();
  return doc.length > 3 ? doc : null;
}

function parseCFile(filePath: string, globalKnown?: { structs: Set<string>, macros: Set<string>, typedefs: Set<string> }): ParsedFile {
  const source = readFileSync(filePath, 'utf-8');
  const parser = new Parser();
  parser.setLanguage(C);
  const tree = parser.parse(source);

  const result: ParsedFile = {
    path: filePath, functions: [], structs: [], macros: [],
    typedefs: [], globals: [], includes: [],
  };

  const knownStructs = new Set<string>(globalKnown?.structs ?? []);
  const knownMacros = new Set<string>(globalKnown?.macros ?? []);
  const knownTypedefs = new Set<string>(globalKnown?.typedefs ?? []);

  function walk(node: Parser.SyntaxNode, depth = 0) {
    // Function definition
    if (node.type === 'function_definition') {
      const declarator = node.childForFieldName('declarator');
      const typeNode = node.childForFieldName('type');
      if (declarator) {
        let name = '';
        let params: string[] = [];
        const findName = (n: Parser.SyntaxNode): void => {
          if (n.type === 'identifier') name = n.text;
          if (n.type === 'function_declarator') {
            const p = n.childForFieldName('parameters');
            if (p) params = p.children.filter(c => c.type === 'parameter_declaration').map(c => c.text);
            const inner = n.childForFieldName('declarator');
            if (inner) findName(inner);
          } else n.children.forEach(findName);
        };
        findName(declarator);

        let pointerPrefix = '';
        let curr: Parser.SyntaxNode | null = declarator;
        while (curr) {
          if (curr.type === 'pointer_declarator') { pointerPrefix = '*' + pointerPrefix; curr = curr.childForFieldName('declarator'); }
          else break;
        }

        const calls: string[] = [];
        const usesStructs = new Set<string>();
        const usesMacros = new Set<string>();
        const usesTypedefs = new Set<string>();
        const body = node.childForFieldName('body');
        if (body) {
          const scanBody = (n: Parser.SyntaxNode): void => {
            if (n.type === 'call_expression') {
              const fn = n.childForFieldName('function');
              if (fn && fn.type === 'identifier') calls.push(fn.text);
            }
            if (n.type === 'identifier' || n.type === 'type_identifier') {
              const id = n.text;
              if (knownStructs.has(id)) usesStructs.add(id);
              if (knownMacros.has(id)) usesMacros.add(id);
              if (knownTypedefs.has(id)) usesTypedefs.add(id);
            }
            n.children.forEach(scanBody);
          };
          scanBody(body);
        }

        if (name) {
          result.functions.push({
            name,
            returnType: ((typeNode?.text ?? 'unknown') + ' ' + pointerPrefix).trim(),
            parameters: params,
            calls: [...new Set(calls)],
            usesStructs: [...usesStructs],
            usesMacros: [...usesMacros],
            usesTypedefs: [...usesTypedefs],
            doc: extractDocComment(source, node.startPosition.row),
            isStatic: /static/.test(node.text.slice(0, 40)),
            line: node.startPosition.row + 1,
          });
        }
      }
    }

    if (node.type === 'struct_specifier') {
      const nameNode = node.childForFieldName('name');
      const body = node.childForFieldName('body');
      if (nameNode && body) {
        const fields: { name: string; type: string }[] = [];
        body.children.filter(c => c.type === 'field_declaration').forEach(c => {
          const typeNode = c.childForFieldName('type');
          const d = c.childForFieldName('declarator');
          if (typeNode && d) fields.push({ name: d.text, type: typeNode.text });
        });
        knownStructs.add(nameNode.text);
        result.structs.push({
          name: nameNode.text, fields,
          doc: extractDocComment(source, node.startPosition.row),
          line: node.startPosition.row + 1,
        });
      }
    }

    if (node.type === 'preproc_def') {
      const nameNode = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      if (nameNode) {
        knownMacros.add(nameNode.text);
        result.macros.push({ name: nameNode.text, value: valueNode?.text ?? '', doc: null, line: node.startPosition.row + 1 });
      }
    }

    if (node.type === 'type_definition') {
      const declarator = node.childForFieldName('declarator');
      const typeNode = node.childForFieldName('type');
      if (declarator && typeNode) {
        const d = declarator.childForFieldName('declarator');
        const name = d?.text ?? declarator.text;
        result.typedefs.push({ name, underlying: typeNode.text, line: node.startPosition.row + 1 });
        knownTypedefs.add(name);
      }
    }

    if (node.type === 'declaration' && depth <= 2) {
      const typeNode = node.childForFieldName('type');
      const declarator = node.childForFieldName('declarator');
      if (typeNode && declarator && !declarator.text.includes('(')) {
        result.globals.push({
          name: declarator.text,
          type: typeNode.text,
          isStatic: /static/.test(node.text.slice(0, 30)),
          line: node.startPosition.row + 1,
        });
      }
    }

    if (node.type === 'preproc_include') {
      const pathNode = node.childForFieldName('path');
      if (pathNode) result.includes.push(pathNode.text.replace(/[<>"]/g, ''));
    }

    node.children.forEach(c => walk(c, depth + 1));
  }

  walk(tree.rootNode);
  return result;
}

function findAllCAndHFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(currentDir: string) {
    for (const entry of readdirSync(currentDir)) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'build' || entry === '.git') continue;
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (['.c', '.h', '.cpp', '.cc', '.hpp'].includes(ext)) results.push(fullPath);
      }
    }
  }
  walk(dir);
  return results;
}

function deriveCodebaseId(rootPath: string): string {
  const normalized = resolve(rootPath).toLowerCase();
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `${basename(normalized)}-${hash}`;
}

function collectGlobalNames(files: string[]): { structs: Set<string>, macros: Set<string>, typedefs: Set<string> } {
  const structs = new Set<string>();
  const macros = new Set<string>();
  const typedefs = new Set<string>();
  for (const file of files) {
    try {
      const parsed = parseCFile(file);
      parsed.structs.forEach(s => structs.add(s.name));
      parsed.macros.forEach(m => macros.add(m.name));
      parsed.typedefs.forEach(t => typedefs.add(t.name));
    } catch {}
  }
  return { structs, macros, typedefs };
}

async function main() {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error('Usage: npx tsx scripts/index-codebase.ts <path-to-codebase>');
    process.exit(1);
  }

  const absoluteDir = resolve(targetDir);
  const codebaseId = deriveCodebaseId(absoluteDir);
  const codebaseName = basename(absoluteDir);

  console.log(`\n🔍 Indexing: ${absoluteDir}`);
  console.log(`   Codebase ID: ${codebaseId}\n`);

  const driver: Driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session: Session = driver.session();

  try {
    await driver.verifyConnectivity();
    console.log('✅ Neo4j connected');

    await session.run(`DROP CONSTRAINT macro_name IF EXISTS`);
    await session.run(`DROP CONSTRAINT struct_name IF EXISTS`);

    await session.run(`MATCH (n) WHERE n.codebaseId = $codebaseId DETACH DELETE n`, { codebaseId });
    await session.run(
      `MERGE (cb:Codebase {id: $codebaseId})
       SET cb.name = $name, cb.rootPath = $rootPath, cb.updatedAt = timestamp()`,
      { codebaseId, name: codebaseName, rootPath: absoluteDir }
    );

    // Schema
    await session.run(`CREATE CONSTRAINT codebase_id IF NOT EXISTS FOR (c:Codebase) REQUIRE c.id IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT file_key IF NOT EXISTS FOR (f:File) REQUIRE f.key IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT function_key IF NOT EXISTS FOR (fn:Function) REQUIRE fn.key IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT struct_key IF NOT EXISTS FOR (s:Struct) REQUIRE s.key IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT macro_key IF NOT EXISTS FOR (m:Macro) REQUIRE m.key IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT typedef_key IF NOT EXISTS FOR (t:Typedef) REQUIRE t.key IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT global_key IF NOT EXISTS FOR (g:Global) REQUIRE g.key IS UNIQUE`);
    await session.run(`CREATE FULLTEXT INDEX function_comment_search IF NOT EXISTS FOR (n:Function) ON EACH [n.name, n.doc]`);
    console.log('✅ Schema ready\n');

    const files = findAllCAndHFiles(absoluteDir);
    console.log(`📂 Found ${files.length} files\n`);

    console.log('🔎 Pass 1: collecting global type names...');
    const globalKnown = collectGlobalNames(files);
    console.log(`   Structs: ${globalKnown.structs.size}, Macros: ${globalKnown.macros.size}, Typedefs: ${globalKnown.typedefs.size}\n`);

    let fCount = 0, sCount = 0, mCount = 0, tCount = 0, gCount = 0, calls = 0, uses = 0;

    for (const file of files) {
      const relPath = relative(absoluteDir, file);
      process.stdout.write(`  [${relPath}]`);
      try {
        const parsed = parseCFile(file, globalKnown);
        const fileKey = `${codebaseId}::${relPath}`;

        await session.run(
          `MERGE (f:File {key: $fileKey})
           SET f.codebaseId = $codebaseId, f.path = $path, f.relativePath = $relPath
           WITH f MATCH (cb:Codebase {id: $codebaseId}) MERGE (cb)-[:CONTAINS]->(f)`,
          { fileKey, codebaseId, path: file, relPath }
        );

        for (const fn of parsed.functions) {
          const fnKey = `${fileKey}::${fn.name}`;
          await session.run(
            `MERGE (fn:Function {key: $fnKey})
             SET fn.codebaseId = $codebaseId, fn.name = $name,
                 fn.returnType = $returnType, fn.parameters = $parameters,
                 fn.doc = $doc, fn.isStatic = $isStatic, fn.line = $line
             WITH fn MATCH (f:File {key: $fileKey}) MERGE (f)-[:DEFINES]->(fn)`,
            { fnKey, codebaseId, name: fn.name, returnType: fn.returnType,
              parameters: fn.parameters, doc: fn.doc, isStatic: fn.isStatic, line: fn.line, fileKey }
          );
          fCount++;

          for (const callee of fn.calls) {
            const ck = `${codebaseId}::callee::${callee}`;
            await session.run(
              `MATCH (caller:Function {key: $fnKey})
               MERGE (callee:Function {key: $ck})
               SET callee.name = $calleeName, callee.codebaseId = $codebaseId
               MERGE (caller)-[:CALLS]->(callee)`,
              { fnKey, ck, calleeName: callee, codebaseId }
            );
            calls++;
          }

          for (const s of fn.usesStructs) {
            const sk = `${codebaseId}::struct::${s}`;
            await session.run(
              `MATCH (fn:Function {key: $fnKey})
               MERGE (st:Struct {key: $sk})
               SET st.name = $sName, st.codebaseId = $codebaseId
               MERGE (fn)-[:USES]->(st)`,
              { fnKey, sk, sName: s, codebaseId }
            );
            uses++;
          }

          for (const m of fn.usesMacros) {
            const mk = `${codebaseId}::macro::${m}`;
            await session.run(
              `MATCH (fn:Function {key: $fnKey})
               MERGE (mc:Macro {key: $mk})
               SET mc.name = $mName, mc.codebaseId = $codebaseId
               MERGE (fn)-[:USES]->(mc)`,
              { fnKey, mk, mName: m, codebaseId }
            );
            uses++;
          }

          for (const t of fn.usesTypedefs) {
            await session.run(
              `MATCH (fn:Function {key: $fnKey})
               MATCH (td:Typedef {codebaseId: $codebaseId, name: $tName})
               MERGE (fn)-[:USES]->(td)`,
              { fnKey, tName: t, codebaseId }
            );
            uses++;
          }
        }

        for (const s of parsed.structs) {
          const sk = `${fileKey}::struct::${s.name}`;
          await session.run(
            `MERGE (st:Struct {key: $sk})
             SET st.codebaseId = $codebaseId, st.name = $name,
                 st.fields = $fields, st.fieldsJson = $fieldsJson,
                 st.doc = $doc, st.line = $line
             WITH st MATCH (f:File {key: $fileKey}) MERGE (f)-[:DEFINES]->(st)`,
            { sk, codebaseId, name: s.name, fields: s.fields.map(f => `${f.type} ${f.name}`),
              fieldsJson: JSON.stringify(s.fields), doc: s.doc, line: s.line, fileKey }
          );
          sCount++;
        }

        for (const m of parsed.macros) {
          const mk = `${fileKey}::macro::${m.name}`;
          await session.run(
            `MERGE (mc:Macro {key: $mk})
             SET mc.codebaseId = $codebaseId, mc.name = $name, mc.value = $value, mc.line = $line
             WITH mc MATCH (f:File {key: $fileKey}) MERGE (f)-[:DEFINES]->(mc)`,
            { mk, codebaseId, name: m.name, value: m.value, line: m.line, fileKey }
          );
          mCount++;
        }

        for (const t of parsed.typedefs) {
          const tk = `${fileKey}::typedef::${t.name}`;
          await session.run(
            `MERGE (td:Typedef {key: $tk})
             SET td.codebaseId = $codebaseId, td.name = $name, td.underlying = $underlying, td.line = $line
             WITH td MATCH (f:File {key: $fileKey}) MERGE (f)-[:DEFINES]->(td)`,
            { tk, codebaseId, name: t.name, underlying: t.underlying, line: t.line, fileKey }
          );
          tCount++;
        }

        for (const g of parsed.globals) {
          const gk = `${fileKey}::global::${g.name}`;
          await session.run(
            `MERGE (gv:Global {key: $gk})
             SET gv.codebaseId = $codebaseId, gv.name = $name, gv.type = $type,
                 gv.isStatic = $isStatic, gv.line = $line
             WITH gv MATCH (f:File {key: $fileKey}) MERGE (f)-[:DEFINES]->(gv)`,
            { gk, codebaseId, name: g.name, type: g.type, isStatic: g.isStatic, line: g.line, fileKey }
          );
          gCount++;
        }

        for (const inc of parsed.includes) {
          const hk = `${codebaseId}::header::${inc}`;
          await session.run(
            `MATCH (f:File {key: $fileKey})
             MERGE (h:Header {key: $hk}) SET h.codebaseId = $codebaseId, h.name = $incName
             MERGE (f)-[:INCLUDES]->(h)`,
            { fileKey, hk, codebaseId, incName: inc }
          );
        }

        console.log(` ✅`);
      } catch (err) {
        console.log(` ❌ ${err}`);
      }
    }

    console.log(`\n📊 SUMMARY:`);
    console.log(`  Codebase:  ${codebaseName}`);
    console.log(`  Files:     ${files.length}`);
    console.log(`  Functions: ${fCount}`);
    console.log(`  Structs:   ${sCount}`);
    console.log(`  Macros:    ${mCount}`);
    console.log(`  Typedefs:  ${tCount}`);
    console.log(`  Globals:   ${gCount}`);
    console.log(`  Calls:     ${calls}`);
    console.log(`  Uses:      ${uses}`);

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
