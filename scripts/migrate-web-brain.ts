import path from 'node:path';
import { astraWebBrain } from '../packages/core/src/agent/web-brain.js';

async function main() {
  const legacyPath = path.join(process.cwd(), '.astra', 'knowledge.json');
  console.log(`\n🔍 Migrating from: ${legacyPath}\n`);

  const count = await astraWebBrain.migrateFromLegacy(legacyPath);

  console.log(`✅ Migrated ${count} facts from legacy knowledge.json`);
  console.log(`\n📊 Web Brain Stats:`);
  const stats = astraWebBrain.stats();
  console.log(`  Total facts:   ${stats.totalFacts}`);
  console.log(`  Total tags:    ${stats.totalTags}`);
  console.log(`  Storage path:  ${stats.basePath}`);
  console.log(`\n  Categories:`);
  for (const [cat, n] of Object.entries(stats.categories)) {
    console.log(`    - ${cat}: ${n} facts`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
