import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const output = 'docs/screenshots/experience';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const suffix = viewport.width > 640 ? 'desktop' : 'mobile';
    await page.goto('http://127.0.0.1:4175/?mapDiagnostics=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.browse-screen, .resource-error-card', { timeout: 45000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${output}/world-${suffix}.png`, fullPage: true });
    if (await page.locator('.browse-screen').count()) {
      const initial = await page.evaluate(() => window.__GEOTYPE_E2E_MAP__?.getDiagnostics());
      await page.evaluate(async (mobile) => {
        await window.__GEOTYPE_E2E_MAP__.centerOn([127.8, mobile ? 30.5 : 36.1], 4.8);
      }, suffix === 'mobile');
      const point = await page.evaluate(() => window.__GEOTYPE_E2E_MAP__.project([127.8, 36.1]));
      await page.mouse.click(point.x, point.y);
      await page.getByTestId('selected-country-name').filter({ hasText: '대한민국' }).waitFor({ timeout: 10000 });
      await page.getByRole('combobox', { name: /문제 수/ }).selectOption('3');
      await page.getByTestId('start-game').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/korea-cities-${suffix}.png`, fullPage: true });
      await page.getByTestId('start-game').click();
      for (let question = 0; question < 3; question += 1) {
        const input = page.getByRole('textbox', { name: '목표 지명 입력' });
        await input.waitFor();
        await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('app-phase-playing'), { timeout: 30000 });
        if (question === 0) {
          await page.getByRole('button', { name: '일시 정지', exact: true }).click();
          await page.getByRole('button', { name: '항해 계속하기' }).click();
          await page.screenshot({ path: `${output}/city-question-${suffix}.png`, fullPage: true });
        }
        const hint = page.getByTestId('manual-hint');
        while (await hint.isEnabled()) await hint.click();
        const target = (await page.getByTestId('hint-mask').locator('span').allTextContents()).join('');
        await input.fill(question === 1 ? '모르는지명' : target);
        if (question === 1) await input.press('Enter');
        await page.waitForFunction((index) => {
          const progress = document.querySelector('.app-shell');
          return progress?.classList.contains('app-phase-finished') || !document.querySelector('input[aria-describedby="input-instruction"]')?.value || index < 0;
        }, question, { timeout: 10000 });
      }
      await page.locator('.result-screen').waitFor({ timeout: 15000 });
      await page.getByLabel('항해 기록에 이름 남기기').fill('탐험가');
      await page.getByRole('button', { name: '기록 저장', exact: true }).click();
      await page.getByText('항해 기록이 저장되었습니다.', { exact: true }).waitFor();
      await page.screenshot({ path: `${output}/result-${suffix}.png`, fullPage: true });
      console.log(JSON.stringify({ viewport, initial, final: await page.evaluate(() => window.__GEOTYPE_E2E_MAP__?.getDiagnostics()), errors, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
    } else {
      console.log(JSON.stringify({ viewport, errors, ui: await page.locator('body').innerText() }));
    }
    await page.close();
  }
} finally {
  await browser.close();
}
