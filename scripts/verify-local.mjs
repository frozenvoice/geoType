import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep the entry point runnable even before npm ci, so a missing runtime or
// dependency never looks like a successful (or silently skipped) check.
const root = fileURLToPath(new URL('../', import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
let problem;
if (major !== 22 || minor < 13) {
  problem = `Node.js 22 >=22.13 is required; found ${process.version}. Select Node 22, then npm ci.`;
} else if (!existsSync(resolve(root, 'node_modules/tsx/package.json'))) {
  problem = 'Locked dependencies are missing. Run npm ci (not npm install), then retry.';
}

async function reportEnvironmentProblem(problem) {
  const directory = resolve(root, '.verification', `${Date.now()}-environment`);
  await mkdir(directory, { recursive: true });
  const report = {
    status: 'ENVIRONMENT INCOMPLETE', node: process.version,
    profile: process.argv[2], problem, steps: [],
    e2e: 'NOT RUN', realMap: 'NOT VERIFIED',
  };
  await writeFile(resolve(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(`ENVIRONMENT INCOMPLETE: ${problem}\nReport: ${directory}/report.json`);
  process.exitCode = 2;
}

if (problem) await reportEnvironmentProblem(problem);
else {
  try {
    const { tsImport } = await import('tsx/esm/api');
    const { runVerification } = await tsImport('./local-verification.ts', import.meta.url);
    await runVerification(process.argv.slice(2));
  } catch (error) {
    await reportEnvironmentProblem(`Dependencies could not load: ${error.message ?? String(error)}. Run npm ci.`);
  }
}
