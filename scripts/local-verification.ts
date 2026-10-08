import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { chromium } from '@playwright/test';
import { LOCAL_BROWSER_ENVIRONMENT } from './verification-environment';

const root = resolve(import.meta.dirname, '..');
const scopes = ['all', 'ui', 'map', 'game', 'language', 'data', 'tooling'] as const;
type Scope = typeof scopes[number];
type Profile = 'quick' | 'full' | 'release';
export type VerificationOptions = { profile: Profile; scopes: Scope[]; realMap: boolean };
type Step = { id: string; script: string; args: string[]; preview?: boolean; realMap?: boolean };
type TestCounts = { passed: number; failed: number; skipped: number; flaky: number };
type StepResult = Step & {
  status: 'PASSED' | 'FAILED' | 'ENVIRONMENT INCOMPLETE' | 'NOT RUN';
  exitCode: number | null; counts?: TestCounts | undefined; log?: string; reason?: string;
};
type LockPackage = { version?: string; optional?: boolean; engines?: Record<string, string> };
type Manifest = {
  dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
};
type Lock = { lockfileVersion?: number; packages?: Record<string, LockPackage & Manifest> };

export function parseVerificationOptions(args: string[]): VerificationOptions {
  const [profile, ...flags] = args;
  if (!profile || !['quick', 'full', 'release'].includes(profile)) {
    throw new Error('Choose quick, full or release. See docs/local-verification.md.');
  }
  const selected: Scope[] = [];
  let realMap = false;
  for (const flag of flags) {
    if (flag === '--real-map') realMap = true;
    else if (flag.startsWith('--scope=')) {
      for (const scope of flag.slice('--scope='.length).split(',')) {
        if (!scopes.includes(scope as Scope)) throw new Error(`Unknown scope: ${scope}`);
        selected.push(scope as Scope);
      }
    } else throw new Error(`Unknown option: ${flag}. Use --scope=map,game or --real-map (Release).`);
  }
  if (realMap && profile !== 'release') throw new Error('--real-map requires Release verification.');
  return { profile: profile as Profile, scopes: [...new Set(selected.length ? selected : ['all' as const])], realMap };
}

const unitPatterns: Record<Exclude<Scope, 'all'>, RegExp> = {
  ui: /^(browse-screen|selection-store|game-screen-|leaderboard-table|storage-unavailable)/,
  map: /^map-/,
  game: /^game-/,
  language: /^(language-|game-ime|game-screen-|game-scope|leaderboard)/,
  data: /^(geodata-|world-country-data|game-scope|language-core)/,
  tooling: /^(local-verification|map-quality-(script|policy|network))/,
};
const browserFiles: Partial<Record<Scope, string[]>> = {
  ui: ['e2e/experience.spec.js', 'e2e/gameplay.spec.js', 'e2e/maplibre-local.spec.js'],
  map: ['e2e/maplibre-local.spec.js', 'e2e/experience.spec.js'],
  game: ['e2e/gameplay.spec.js', 'e2e/experience.spec.js'],
  language: ['e2e/gameplay.spec.js'],
};

export function createVerificationPlan(options: VerificationOptions, testFiles: string[]): Step[] {
  const all = options.scopes.includes('all');
  const plan: Step[] = [];
  if (options.profile === 'quick') {
    const selected = all ? [] : testFiles.filter((file) => options.scopes.some((scope) => (
      scope !== 'all' && unitPatterns[scope].test(file)
    ))).map((file) => `src/tests/${file}`);
    if (!all && selected.length === 0) throw new Error('No unit tests match this scope; verification cannot pass without tests.');
    plan.push(
      { id: 'lint', script: 'lint', args: [] },
      { id: 'typecheck', script: 'typecheck', args: [] },
      { id: 'unit', script: 'test', args: selected },
    );
  } else {
    // check already owns lint, TypeScript, Vitest, geodata and production build.
    plan.push({ id: 'check', script: 'check', args: [] });
  }
  const files = [...new Set(options.scopes.flatMap((scope) => browserFiles[scope] ?? []))];
  if (options.profile === 'release' || all || files.length > 0) {
    plan.push({
      id: 'e2e', script: 'e2e',
      args: [
        ...(options.profile === 'release' || all ? [] : files),
        '--project=chromium', '--project=mobile-chromium', '--forbid-only', '--workers=1', '--retries=0',
      ],
      preview: options.profile !== 'quick',
    });
  }
  if (options.realMap) {
    plan.push({
      id: 'real-map', script: 'e2e', realMap: true,
      // Capture with a fresh dev server pinned to free OpenFreeMap. The default
      // release E2E above checks the actual production bundle independently.
      preview: false,
      args: ['--project=chromium', '--project=mobile-chromium', '--forbid-only', '--workers=1', '--retries=0'],
    });
  }
  return plan;
}

export function validateLockState(manifest: Manifest, lock: Lock, installed: Lock): string[] {
  const problems: string[] = [];
  if (lock.lockfileVersion !== 3 || !lock.packages?.['']) {
    return ['package-lock.json must contain a v3 locked root manifest.'];
  }
  for (const section of ['dependencies', 'devDependencies', 'engines'] as const) {
    const expected = manifest[section] ?? {};
    const locked = lock.packages[''][section] ?? {};
    const names = new Set([...Object.keys(expected), ...Object.keys(locked)]);
    if ([...names].some((name) => expected[name] !== locked[name])) {
      problems.push(`package.json ${section} differs from package-lock.json. Update the lock intentionally, then npm ci.`);
    }
  }
  if (!installed.packages) return [...problems, 'node_modules lock is missing; run npm ci.'];
  for (const [path, expected] of Object.entries(lock.packages)) {
    if (!path) continue;
    const actual = installed.packages[path];
    if (!actual && expected.optional) continue; // npm omits other-platform optional packages.
    if (!actual || actual.version !== expected.version) problems.push(`Installed ${path} differs from lock; run npm ci.`);
  }
  for (const path of Object.keys(installed.packages)) {
    if (path && !lock.packages[path]) problems.push(`Unlocked installed package: ${path}. Run npm ci.`);
  }
  return problems;
}

export function parseTestCounts(output: string, browser: boolean): TestCounts | undefined {
  const plain = stripVTControlCharacters(output);
  const summary = browser ? plain : /\bTests\s+([^\n]+)/.exec(plain)?.[1];
  if (!summary) return undefined;
  const counts: TestCounts = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
  let found = false;
  for (const match of summary.matchAll(/(?:^|\s)(\d+) (passed|failed|skipped|flaky)\b/g)) {
    counts[match[2] as keyof TestCounts] = Number(match[1]);
    found = true;
  }
  return found ? counts : undefined;
}

export function verificationStatus(results: StepResult[]): 'PASSED' | 'FAILED' | 'ENVIRONMENT INCOMPLETE' {
  if (results.some((step) => step.status === 'FAILED')) return 'FAILED';
  if (results.some((step) => step.status !== 'PASSED')) return 'ENVIRONMENT INCOMPLETE';
  return 'PASSED';
}

export function classifyExecutedStep(exitCode: number | null, needsTests: boolean, counts?: TestCounts): StepResult['status'] {
  if (exitCode !== 0) return 'FAILED';
  if (needsTests && (!counts || counts.passed === 0 || counts.skipped > 0)) return 'ENVIRONMENT INCOMPLETE';
  if (counts && (counts.failed > 0 || counts.flaky > 0)) return 'FAILED';
  return 'PASSED';
}

async function executeStep(step: Step, directory: string, npmCli: string): Promise<StepResult> {
  const stepDirectory = resolve(directory, step.id);
  await mkdir(stepDirectory, { recursive: true });
  const args = ['run', step.script, ...(step.args.length ? ['--', ...step.args] : [])];
  if (step.script === 'e2e') {
    // Keep screenshots/traces/video and server policy in playwright.config.ts;
    // only relocate evidence so successive runs cannot overwrite each other.
    args.push(`--output=${resolve(stepDirectory, 'artifacts')}`, '--reporter=list,html,json');
  }
  const environment: NodeJS.ProcessEnv = {
    ...process.env, ...LOCAL_BROWSER_ENVIRONMENT, FORCE_COLOR: '0',
    GEOTYPE_E2E_PREVIEW: step.preview ? '1' : '0',
    GEOTYPE_REAL_MAP: step.realMap ? '1' : '0',
    PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(stepDirectory, 'playwright.json'),
    PLAYWRIGHT_HTML_OUTPUT_DIR: resolve(stepDirectory, 'html'),
  };
  delete environment.NO_COLOR;
  // Node selected for this runner must also own npm's subprocesses and Vite.
  environment.PATH = `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`;
  console.log(`\n[${step.id}] npm ${args.join(' ')}`);
  let output = '';
  const exitCode = await new Promise<number | null>((done) => {
    const child = spawn(process.execPath, [npmCli, ...args], {
      cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); process.stderr.write(chunk); });
    child.on('error', (error) => { output += `\n${error.message}`; });
    child.on('close', done);
  });
  const log = resolve(stepDirectory, 'output.log');
  await writeFile(log, output, 'utf8');
  let counts = parseTestCounts(output, step.script === 'e2e');
  if (step.script === 'e2e') {
    try {
      const browserReport = JSON.parse(await readFile(resolve(stepDirectory, 'playwright.json'), 'utf8')) as {
        stats: { expected: number; unexpected: number; skipped: number; flaky: number };
      };
      counts = {
        passed: browserReport.stats.expected, failed: browserReport.stats.unexpected,
        skipped: browserReport.stats.skipped, flaky: browserReport.stats.flaky,
      };
    } catch {
      // A server/startup failure can occur before the JSON reporter is ready;
      // its nonzero exit remains a failure, never fabricated test evidence.
      if (exitCode === 0) counts = undefined;
    }
  }
  const status = classifyExecutedStep(exitCode, ['test', 'check', 'e2e'].includes(step.script), counts);
  return {
    ...step, exitCode, log,
    status, counts,
    ...(status === 'ENVIRONMENT INCOMPLETE' ? { reason: 'Required tests were skipped or no executed test evidence was produced.' } : {}),
  };
}

export async function runVerification(args: string[]): Promise<void> {
  const profileLabel = ['quick', 'full', 'release'].includes(args[0] ?? '') ? args[0] : 'invalid';
  const directory = resolve(root, '.verification', `${Date.now()}-${profileLabel}`);
  await mkdir(directory, { recursive: true });
  const results: StepResult[] = [];
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(), node: process.version,
    npm: process.env.npm_config_user_agent?.match(/^npm\/(\S+)/)?.[1] ?? 'unknown (direct Node invocation)',
    steps: results,
    e2e: 'NOT RUN', realMap: 'NOT VERIFIED',
    unverified: ['Real-map visual quality and DEM terrain require separate browser evidence and visual review.'],
  };
  try {
    const options = parseVerificationOptions(args);
    report.options = options;
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as Manifest;
    const lockText = await readFile(resolve(root, 'package-lock.json'), 'utf8');
    const lock = JSON.parse(lockText) as Lock;
    const installed = JSON.parse(await readFile(resolve(root, 'node_modules/.package-lock.json'), 'utf8')) as Lock;
    report.lockSha256 = createHash('sha256').update(lockText).digest('hex');
    const problems = validateLockState(manifest, lock, installed);
    // Inspect actual direct package manifests too; a stale hidden lock alone
    // must not make a mismatched installed dependency look reproducible.
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      const actual = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8')) as LockPackage;
      if (actual.version !== lock.packages?.[`node_modules/${name}`]?.version) problems.push(`Installed ${name} version differs from lock.`);
    }
    if (problems.length) throw new Error(problems.join('\n'));
    const npmCli = process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    if (!existsSync(npmCli)) throw new Error('npm CLI not found; invoke this runner through npm run verify:<profile>.');
    const plan = createVerificationPlan(options, await readdir(resolve(root, 'src/tests')));
    report.plan = plan;
    let browserProblem: string | undefined;
    if (plan.some((step) => step.script === 'e2e')) {
      try {
        const browser = await chromium.launch({ headless: true });
        await browser.close();
        report.browserEnvironment = 'AVAILABLE';
      } catch (error) {
        browserProblem = `${error instanceof Error ? error.message : String(error)}\nInstall explicitly: npx playwright install chromium (Linux may also need --with-deps).`;
        report.browserEnvironment = { status: 'ENVIRONMENT INCOMPLETE', reason: browserProblem };
        console.error(`ENVIRONMENT INCOMPLETE: Chromium could not launch.\n${browserProblem}`);
      }
    }
    for (const step of plan) {
      if (results.some((result) => result.status === 'FAILED')) {
        results.push({ ...step, status: 'NOT RUN', exitCode: null, reason: 'A required earlier gate failed.' });
      } else if (step.script === 'e2e' && browserProblem) {
        results.push({ ...step, status: 'ENVIRONMENT INCOMPLETE', exitCode: null, reason: browserProblem });
      } else {
        results.push(await executeStep(step, directory, npmCli));
      }
    }
    report.status = verificationStatus(results);
    report.e2e = results.find((step) => step.id === 'e2e')?.status ?? 'NOT RUN (scope has no browser changes)';
    const real = results.find((step) => step.id === 'real-map');
    report.realMap = real?.status === 'PASSED'
      ? 'BROWSER EVIDENCE CAPTURED; visual REVIEW REQUIRED; DEM terrain UNSUPPORTED'
      : real?.status ?? 'NOT VERIFIED (--real-map not requested)';
    process.exitCode = report.status === 'PASSED' ? 0 : report.status === 'FAILED' ? 1 : 2;
  } catch (error) {
    report.status = 'ENVIRONMENT INCOMPLETE';
    report.problem = error instanceof Error ? error.message : String(error);
    console.error(`ENVIRONMENT INCOMPLETE: ${String(report.problem)}`);
    process.exitCode = 2;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(resolve(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nVerification: ${String(report.status)}\nE2E: ${String(report.e2e)}\nReal map: ${String(report.realMap)}\nReport: ${directory}/report.json`);
    for (const step of results) {
      console.log(`${step.id}: ${step.status}${step.counts ? ` (${JSON.stringify(step.counts)})` : ''}`);
    }
  }
}
