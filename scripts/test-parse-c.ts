import Parser from 'tree-sitter';
import C from 'tree-sitter-c';
import { readFileSync } from 'node:fs';

interface ParsedFunction {
  name: string;
  returnType: string;
  parameters: string[];
  calls: string[];
  line: number;
}

interface ParsedStruct {
  name: string;
  fields: { name: string; type: string }[];
  line: number;
}

interface ParsedMacro {
  name: string;
  value: string;
  line: number;
}

function parseCFile(filePath: string) {
  const source = readFileSync(filePath, 'utf-8');
  const parser = new Parser();
  parser.setLanguage(C);

  const tree = parser.parse(source);
  const functions: ParsedFunction[] = [];
  const structs: ParsedStruct[] = [];
  const macros: ParsedMacro[] = [];
  const allCalls: string[] = [];

  function walk(node: Parser.SyntaxNode) {
    // Function definitions
    if (node.type === 'function_definition') {
      const declarator = node.childForFieldName('declarator');
      const typeNode = node.childForFieldName('type');

      if (declarator) {
        let name = '';
        let params: string[] = [];

        // Walk declarator to find function name and params
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

        // Collect call expressions inside body
        const calls: string[] = [];
        const body = node.childForFieldName('body');
        if (body) {
          const findCalls = (n: Parser.SyntaxNode): void => {
            if (n.type === 'call_expression') {
              const fn = n.childForFieldName('function');
              if (fn && fn.type === 'identifier') {
                calls.push(fn.text);
                allCalls.push(fn.text);
              }
            }
            n.children.forEach(findCalls);
          };
          findCalls(body);
        }

        if (name) {
          // Extract pointer/reference from declarator
          let pointerPrefix = '';
          let curr = declarator;
          while (curr) {
            if (curr.type === 'pointer_declarator') {
              pointerPrefix = '*' + pointerPrefix;
              curr = curr.childForFieldName('declarator');
            } else {
              break;
            }
          }
          functions.push({
            name,
            returnType: ((typeNode?.text ?? 'unknown') + ' ' + pointerPrefix).trim(),
            parameters: params,
            calls,
            line: node.startPosition.row + 1,
          });
        }
      }
    }

    // Struct definitions
    if (node.type === 'struct_specifier') {
      const nameNode = node.childForFieldName('name');
      const body = node.childForFieldName('body');
      if (nameNode && body) {
        const fields: { name: string; type: string }[] = [];
        body.children
          .filter(c => c.type === 'field_declaration')
          .forEach(c => {
            const typeNode = c.childForFieldName('type');
            const declarator = c.childForFieldName('declarator');
            if (typeNode && declarator) {
              fields.push({ name: declarator.text, type: typeNode.text });
            }
          });
        structs.push({
          name: nameNode.text,
          fields,
          line: node.startPosition.row + 1,
        });
      }
    }

    // Preprocessor macros
    if (node.type === 'preproc_def') {
      const nameNode = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      if (nameNode) {
        macros.push({
          name: nameNode.text,
          value: valueNode?.text ?? '',
          line: node.startPosition.row + 1,
        });
      }
    }

    node.children.forEach(walk);
  }

  walk(tree.rootNode);

  return { functions, structs, macros, allCalls };
}

// ==== MAIN ====

const targetFile = process.argv[2];
if (!targetFile) {
  console.error('Usage: npx tsx scripts/test-parse-c.ts <path-to-c-file>');
  process.exit(1);
}

console.log(`\n🔍 Parsing: ${targetFile}\n`);

const result = parseCFile(targetFile);

console.log(`📊 RESULT:`);
console.log(`  Functions: ${result.functions.length}`);
console.log(`  Structs:   ${result.structs.length}`);
console.log(`  Macros:    ${result.macros.length}`);
console.log(`  Calls:     ${result.allCalls.length}\n`);

console.log(`🔧 FUNCTIONS (first 20):`);
result.functions.slice(0, 20).forEach(fn => {
  console.log(`  [line ${fn.line}] ${fn.returnType} ${fn.name}(${fn.parameters.join(', ')})`);
  if (fn.calls.length > 0) {
    console.log(`    → calls: ${fn.calls.join(', ')}`);
  }
});

console.log(`\n🏗️  STRUCTS (first 10):`);
result.structs.slice(0, 10).forEach(s => {
  console.log(`  [line ${s.line}] struct ${s.name} { ${s.fields.length} fields }`);
  s.fields.slice(0, 3).forEach(f => console.log(`    ${f.type} ${f.name};`));
});

console.log(`\n📝 MACROS (first 10):`);
result.macros.slice(0, 10).forEach(m => {
  console.log(`  [line ${m.line}] #define ${m.name} ${m.value.slice(0, 50)}`);
});

// Write full result to JSON
import { writeFileSync } from 'node:fs';
const outputPath = '/tmp/parse-c-output.json';
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(`\n💾 Full result saved to: ${outputPath}\n`);
