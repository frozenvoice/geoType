// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  classifyExecutedStep, createVerificationPlan, parseTestCounts, parseVerificationOptions,
  validateLockState, verificationStatus,
} from '../../scripts/local-verification';

describe('local verification completion policy', () => {
  it('keeps Full on check once and selects both projects for related browser flows', () => {
    const plan = createVerificationPlan(parseVerificationOptions(['full', '--scope=map,language']), []);
    expect(plan.filter((step) => step.script === 'check')).toHaveLength(1);
    expect(plan.map((step) => step.script)).toEqual(['check', 'e2e']);
    expect(plan[1]?.args).toEqual(expect.arrayContaining([
      'e2e/maplibre-local.spec.js', 'e2e/experience.spec.js', 'e2e/gameplay.spec.js',
      '--project=chromium', '--project=mobile-chromium', '--forbid-only',
    ]));
    expect(plan[1]?.preview).toBe(true);
  });

  it('cannot shrink Release browser coverage with a data-only scope', () => {
    const plan = createVerificationPlan(parseVerificationOptions(['release', '--scope=data', '--real-map']), []);
    expect(plan.map((step) => step.id)).toEqual(['check', 'e2e', 'real-map']);
    expect(plan[1]?.args.some((arg) => arg.endsWith('.spec.js'))).toBe(false);
    expect(plan[1]?.preview).toBe(true);
    expect(plan[2]).toMatchObject({ realMap: true, preview: false });
  });

  it('runs focused Quick unit tests and related UI E2E without building', () => {
    const plan = createVerificationPlan(parseVerificationOptions(['quick', '--scope=game']), [
      'game-store-pause.test.ts', 'language-core.test.ts', 'game-screen-ime.test.tsx',
    ]);
    expect(plan.map((step) => step.script)).toEqual(['lint', 'typecheck', 'test', 'e2e']);
    expect(plan[2]?.args).toEqual(['src/tests/game-store-pause.test.ts', 'src/tests/game-screen-ime.test.tsx']);
    expect(plan[3]?.preview).toBe(false);
  });

  it('data-only Full validates geodata through check without external sync or browser work', () => {
    const plan = createVerificationPlan(parseVerificationOptions(['full', '--scope=data']), []);
    expect(plan).toEqual([{ id: 'check', script: 'check', args: [] }]);
  });

  it.each([
    ['quick', '--scope=typo'], ['release', '--list'], ['quick', '--real-map'], ['unknown'],
  ])('rejects unknown or misleading execution options: %j', (...args) => {
    expect(() => parseVerificationOptions(args)).toThrow();
  });

  it('rejects a Quick scope that would run no regression tests', () => {
    expect(() => createVerificationPlan(parseVerificationOptions(['quick', '--scope=map']), [])).toThrow(/No unit tests/);
  });

  it('does not call missing browsers or unexecuted gates PASS', () => {
    const step = { id: 'e2e', script: 'e2e', args: [], exitCode: null };
    expect(verificationStatus([{ ...step, status: 'ENVIRONMENT INCOMPLETE' }])).toBe('ENVIRONMENT INCOMPLETE');
    expect(verificationStatus([{ ...step, status: 'NOT RUN' }])).toBe('ENVIRONMENT INCOMPLETE');
    expect(verificationStatus([{ ...step, status: 'FAILED' }])).toBe('FAILED');
  });

  it('rejects zero-test, skipped or flaky evidence even when a subprocess exits zero', () => {
    const counts = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
    expect(classifyExecutedStep(0, true)).toBe('ENVIRONMENT INCOMPLETE');
    expect(classifyExecutedStep(0, true, counts)).toBe('ENVIRONMENT INCOMPLETE');
    expect(classifyExecutedStep(0, true, { ...counts, passed: 1, skipped: 1 })).toBe('ENVIRONMENT INCOMPLETE');
    expect(classifyExecutedStep(0, true, { ...counts, passed: 1, flaky: 1 })).toBe('FAILED');
    expect(classifyExecutedStep(0, true, { ...counts, passed: 1 })).toBe('PASSED');
    expect(classifyExecutedStep(1, true, { ...counts, passed: 1 })).toBe('FAILED');
  });
});

describe('lockfile and executed evidence checks', () => {
  const manifest = { dependencies: { react: '^19.1.0' }, engines: { node: '>=22.13.0 <23' } };
  const lock = { lockfileVersion: 3, packages: {
    '': manifest, 'node_modules/react': { version: '19.2.0' },
    'node_modules/other-platform': { version: '1.0.0', optional: true },
  } };
  const installed = { packages: { 'node_modules/react': { version: '19.2.0' } } };

  it('permits omitted platform-specific optional packages but rejects stale dependency versions', () => {
    expect(validateLockState(manifest, lock, installed)).toEqual([]);
    expect(validateLockState(manifest, lock, { packages: { 'node_modules/react': { version: '19.1.0' } } })).toEqual([
      expect.stringContaining('Installed node_modules/react differs'),
    ]);
  });

  it('detects manifest/lock drift and extra unpinned installed packages', () => {
    expect(validateLockState({ ...manifest, dependencies: { react: '^19.3.0' } }, lock, installed))
      .toEqual([expect.stringContaining('dependencies differs')]);
    expect(validateLockState(manifest, lock, { packages: { ...installed.packages, 'node_modules/unlocked': { version: '1' } } }))
      .toEqual([expect.stringContaining('Unlocked installed package')]);
  });

  it('records tests from summaries without counting test files as tests', () => {
    expect(parseTestCounts('Test Files 2 passed\nTests 7 passed | 1 failed | 2 skipped\n', false))
      .toEqual({ passed: 7, failed: 1, skipped: 2, flaky: 0 });
    expect(parseTestCounts('Running 12 tests\n  2 failed\n  1 flaky\n  9 passed (12s)\n', true))
      .toEqual({ passed: 9, failed: 2, skipped: 0, flaky: 1 });
    expect(parseTestCounts('No tests executed: browser unavailable', true)).toBeUndefined();
  });
});
