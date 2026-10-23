import { defineConfig, devices } from '@playwright/test';
import { LOCAL_BROWSER_ENVIRONMENT, localChromiumLaunchOptions } from './scripts/verification-environment';

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const serverCommand = process.env.GEOTYPE_E2E_PREVIEW === '1' ? 'preview' : 'dev';
const realMapEvidence = process.env.GEOTYPE_REAL_MAP === '1';

export default defineConfig({
  testDir: './e2e',
  // Hosted-map evidence is explicit and never part of deterministic E2E.
  ...(realMapEvidence
    ? { testMatch: '**/real-map-quality.spec.js' }
    : { testIgnore: '**/real-map-quality.spec.js' }),
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    colorScheme: 'dark',
    locale: 'ko-KR',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
    launchOptions: localChromiumLaunchOptions(),
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `npm run ${serverCommand} -- --host 127.0.0.1 --port ${port} --strictPort`,
    env: {
      // Vite process values take precedence over local .env provider overrides.
      // A prebuilt preview cannot be overridden here; the spec fails closed
      // against any external provider other than free OpenFreeMap resources.
      ...LOCAL_BROWSER_ENVIRONMENT,
    },
    url: baseURL,
    // Never run GeoType assertions against an unrelated app occupying this
    // port. Fail clearly on a collision instead of reusing that server.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
