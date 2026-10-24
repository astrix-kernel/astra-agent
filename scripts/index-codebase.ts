import Parser from 'tree-sitter';
import C from 'tree-sitter-c';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const NEO4J_URI = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env['NEO4J_USER'] ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'astra-knowledge-2026';

interface ParsedFile {
  path: string;
  functions: { name: string; returnType: string; parameters: string[]; calls: string[]; line: number }[];
  structs: { name: string; fields: { name: string; type: string }[]; line: number }[];
  macros: { name: string; value: string; line: number }[];
  includes: string[];
}

function parseCFile(filePath: string): ParsedFile {
  const source = readFileSync(filePath, 'utf-8');
  const parser = new Parser();
  parser.setLanguage(C);
  const tree = parser.parse(source);

  const result: ParsedFile = {
    path: filePath,
    functions: [],
    structs: [],
    macros: [],
    includes: [],
  };

  function walk(node: Parser.SyntaxNode) {
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
            if (p) {
              params = p.children
                .filter(c => c.type === 'parameter_declaration')
                .map(c => c.text);
            }
            const inner = n.childForFieldName('declarator');
            if (inner) findName(inner);
          } else {
            n.children.forEach(findName);
          }
        };
        findName(declarator);

        let pointerPrefix = '';
        let curr: Parser.SyntaxNode | null = declarator;
        while (curr) {
          if (curr.type === 'pointer_declarator') {
            pointerPrefix = '*' + pointerPrefix;
            curr = curr.childForFieldName('declarator');
          } else break;
        }

        const calls: string[] = [];
        const body = node.childForFieldName('body');
        if (body) {
          const findCalls = (n: Parser.SyntaxNode): void => {
            if (n.type === 'call_expression') {
              const fn = n.childForFieldName('function');
              if (fn && fn.type === 'identifier') calls.push(fn.text);
            }
            n.children.forEach(findCalls);
          };
          findCalls(body);
        }

        if (name) {
          result.functions.push({
            name,
            returnType: ((typeNode?.text ?? 'unknown') + ' ' + pointerPrefix).trim(),
            parameters: params,
            calls: [...new Set(calls)],
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
          const declarator = c.childForFieldName('declarator');
          if (typeNode && declarator) fields.push({ name: declarator.text, type: typeNode.text });
        });
        result.structs.push({ name: nameNode.text, fields, line: node.startPosition.row + 1 });
      }
    }

    if (node.type === 'preproc_def') {
      const nameNode = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      if (nameNode) result.macros.push({ name: nameNode.text, value: valueNode?.text ?? '', line: node.startPosition.row + 1 });
    }

    if (node.type === 'preproc_include') {
      const pathNode = node.childForFieldName('path');
      if (pathNode) result.includes.push(pathNode.text.replace(/[<>"]/g, ''));
    }

    node.children.forEach(walk);
  }

  walk(tree.rootNode);
  return result;
}

function findAllCAndHFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(currentDir: string) {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'build' || entry === '.git') continue;
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (['.c', '.h', '.cpp', '.cc', '.hpp'].includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }
  walk(dir);
  return results;
}

// Derive a stable unique identifier from the codebase root path
function deriveCodebaseId(rootPath: string): string {
  const normalized = resolve(rootPath).toLowerCase();
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `${basename(normalized)}-${hash}`;
}

async function main() {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error('Usage: npx tsx scripts/index-codebase.ts <path-to-codebase>');
    console.error('Example: npx tsx scripts/index-codebase.ts /path/to/kernel');
    process.exit(1);
  }

  const absoluteDir = resolve(targetDir);
  const codebaseId = deriveCodebaseId(absoluteDir);
  const codebaseName = basename(absoluteDir);

  console.log(`\n🔍 Indexing codebase: ${absoluteDir}`);
  console.log(`   Codebase ID: ${codebaseId}\n`);

  const driver: Driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session: Session = driver.session();

  try {
    await driver.verifyConnectivity();
    console.log('✅ Neo4j connected');

    // Cleanup: ONLY nodes belonging to this codebase
    console.log(`🧹 Cleaning up nodes for codebase "${codebaseId}"...`);
    await session.run(
      `MATCH (n) WHERE n.codebaseId = $codebaseId DETACH DELETE n`,
      { codebaseId }
    );

    // Register codebase node
    await session.run(
      `MERGE (cb:Codebase {id: $codebaseId})
       SET cb.name = $name, cb.rootPath = $rootPath, cb.updatedAt = timestamp()`,
      { codebaseId, name: codebaseName, rootPath: absoluteDir }
    );

    // Auto-migrate: drop old v1 constraints
    await session.run(`DROP CONSTRAINT macro_name IF EXISTS`);
    await session.run(`DROP CONSTRAINT struct_name IF EXISTS`);

    // Schema (idempotent)
    await session.run(`CREATE CONSTRAINT codebase_id IF NOT EXISTS FOR (c:Codebase) REQUIRE c.id IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT file_key IF NOT EXISTS FOR (f:File) REQUIRE f.key IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT function_key IF NOT EXISTS FOR (fn:Function) REQUIRE fn.key IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT struct_key IF NOT EXISTS FOR (s:Struct) REQUIRE s.key IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT macro_key IF NOT EXISTS FOR (m:Macro) REQUIRE m.key IS UNIQUE`);
    console.log('✅ Schema ready\n');

    const files = findAllCAndHFiles(absoluteDir);
    console.log(`📂 Found ${files.length} C/C++ files\n`);

    let totalFunctions = 0, totalStructs = 0, totalMacros = 0, totalCalls = 0;

    for (const file of files) {
      const relPath = relative(absoluteDir, file);
      process.stdout.write(`  [${relPath}]`);

      try {
        const parsed = parseCFile(file);
        const fileKey = `${codebaseId}::${relPath}`;

        await session.run(
          `MERGE (f:File {key: $fileKey})
           SET f.codebaseId = $codebaseId, f.path = $path, f.relativePath = $relPath
           WITH f
           MATCH (cb:Codebase {id: $codebaseId})
           MERGE (cb)-[:CONTAINS]->(f)`,
          { fileKey, codebaseId, path: file, relPath }
        );

        for (const fn of parsed.functions) {
          const fnKey = `${fileKey}::${fn.name}`;
          await session.run(
            `MERGE (fn:Function {key: $fnKey})
             SET fn.codebaseId = $codebaseId, fn.name = $name,
                 fn.returnType = $returnType, fn.parameters = $parameters, fn.line = $line
             WITH fn
             MATCH (f:File {key: $fileKey})
             MERGE (f)-[:DEFINES]->(fn)`,
            { fnKey, codebaseId, name: fn.name, returnType: fn.returnType, parameters: fn.parameters, line: fn.line, fileKey }
          );
          totalFunctions++;

          for (const callee of fn.calls) {
            const calleeKey = `${codebaseId}::callee::${callee}`;
            await session.run(
              `MATCH (caller:Function {key: $fnKey})
               MERGE (callee:Function {key: $calleeKey})
               SET callee.name = $calleeName, callee.codebaseId = $codebaseId
               MERGE (caller)-[:CALLS]->(callee)`,
              { fnKey, calleeKey, calleeName: callee, codebaseId }
            );
            totalCalls++;
          }
        }

        for (const s of parsed.structs) {
          const structKey = `${fileKey}::struct::${s.name}`;
          await session.run(
            `MERGE (st:Struct {key: $structKey})
             SET st.codebaseId = $codebaseId, st.name = $name,
                 st.fields = $fields, st.fieldsJson = $fieldsJson, st.line = $line
             WITH st
             MATCH (f:File {key: $fileKey})
             MERGE (f)-[:DEFINES]->(st)`,
            {
              structKey, codebaseId, name: s.name,
              fields: s.fields.map(f => `${f.type} ${f.name}`),
              fieldsJson: JSON.stringify(s.fields),
              line: s.line, fileKey,
            }
          );
          totalStructs++;
        }

        for (const m of parsed.macros) {
          const macroKey = `${fileKey}::macro::${m.name}`;
          await session.run(
            `MERGE (mc:Macro {key: $macroKey})
             SET mc.codebaseId = $codebaseId, mc.name = $name,
                 mc.value = $value, mc.line = $line
             WITH mc
             MATCH (f:File {key: $fileKey})
             MERGE (f)-[:DEFINES]->(mc)`,
            { macroKey, codebaseId, name: m.name, value: m.value, line: m.line, fileKey }
          );
          totalMacros++;
        }

        for (const inc of parsed.includes) {
          const headerKey = `${codebaseId}::header::${inc}`;
          await session.run(
            `MATCH (f:File {key: $fileKey})
             MERGE (h:Header {key: $headerKey})
             SET h.codebaseId = $codebaseId, h.name = $incName
             MERGE (f)-[:INCLUDES]->(h)`,
            { fileKey, headerKey, codebaseId, incName: inc }
          );
        }

        console.log(` ✅`);
      } catch (err) {
        console.log(` ❌ ${err}`);
      }
    }

    console.log(`\n📊 SUMMARY:`);
    console.log(`  Codebase:  ${codebaseName} (${codebaseId})`);
    console.log(`  Files:     ${files.length}`);
    console.log(`  Functions: ${totalFunctions}`);
    console.log(`  Structs:   ${totalStructs}`);
    console.log(`  Macros:    ${totalMacros}`);
    console.log(`  Calls:     ${totalCalls}\n`);

    const countResult = await session.run(
      `MATCH (fn:Function {codebaseId: $codebaseId}) RETURN count(fn) AS count`,
      { codebaseId }
    );
    console.log(`✅ Neo4j now has ${countResult.records[0].get('count')} Function nodes for "${codebaseId}"`);

    // List all codebases
    const codebases = await session.run(
      `MATCH (cb:Codebase) RETURN cb.id AS id, cb.name AS name, cb.rootPath AS root ORDER BY cb.name`
    );
    console.log(`\n🗂️  All indexed codebases:`);
    codebases.records.forEach(r => {
      console.log(`   - ${r.get('name')} (${r.get('id')})`);
      console.log(`     ${r.get('root')}`);
    });

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
