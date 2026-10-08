import { expect, test } from './deterministic-test.js';

// The DOM map is an intentional test renderer: it keeps these flows
// deterministic while still exercising the production catalog and game loop.
const testUrl = '/?mapProvider=test&renderer=dom&e2e=1&debug=1';
const KOREA_ID = 'natural-earth:country:KOR';

async function openMenu(page) {
  await page.goto(testUrl);
  await expect(page.getByTestId('selected-country-name')).toHaveText('출발 지역을 선택하세요', { timeout: 20_000 });
  await expect(page.locator('.simple-map')).toBeVisible();
  await expect(page.getByTestId('map-debug-status')).toContainText('simple');
}

async function selectKorea(page) {
  const search = page.getByLabel('국가 검색');
  await search.fill('대한민국');
  const country = page.locator(`[data-country-id="${KOREA_ID}"]`);
  await expect(country).toBeVisible();
  await country.click();
  await expect(page.getByTestId('selected-country-name')).toHaveText('대한민국');
  await expect(page.locator('.simple-country.is-target')).toHaveCount(1);
}

async function chooseQuestionType(page, typeLabel) {
  const fieldset = page.locator('.geo-type-fieldset');
  await expect(fieldset).toBeVisible();
  const checkboxes = fieldset.getByRole('checkbox');
  for (let index = 0; index < await checkboxes.count(); index += 1) {
    const checkbox = checkboxes.nth(index);
    const label = (await checkbox.locator('..').innerText()).trim();
    if (label !== typeLabel && await checkbox.isChecked()) await checkbox.locator('..').click();
  }
  const desired = fieldset.getByRole('checkbox', { name: new RegExp(`^${typeLabel}$`) });
  if (!(await desired.isChecked())) await desired.locator('..').click();
  await expect(desired).toBeChecked();
  await expect(page.getByTestId('start-game')).toContainText('1문제 시작');
}

async function setQuestionCount(page, count) {
  const select = page.locator('.geo-scope-row label').filter({ hasText: '문제 수' }).locator('select');
  await expect(select).toBeVisible();
  await select.selectOption(String(count));
  await expect(select).toHaveValue(String(count));
}

async function start(page) {
  await page.getByTestId('start-game').click();
  const answer = page.getByRole('textbox', { name: '목표 지명 입력' });
  await expect(page.getByLabel('진행 상황')).toContainText(/01 \/ \d+/, { timeout: 15_000 });
  await expect(answer).toBeEnabled({ timeout: 15_000 });
  return answer;
}

async function skipCurrent(page) {
  await page.getByRole('button', { name: '정답 보고 넘기기' }).click();
  await expect(page.locator('.verdict-miss')).toBeVisible();
}

async function finishSingleQuestion(page) {
  await skipCurrent(page);
  await expect(page.locator('.result-screen')).toBeVisible({ timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Keep the seed clear across a test's reload so persistence is testable;
    // each Playwright test still receives a fresh browser context.
    if (window.name !== 'geotype-e2e-seeded') {
      window.localStorage.clear();
      window.indexedDB.deleteDatabase('geotype-geodata');
      window.name = 'geotype-e2e-seeded';
    }
  });
});

test('간단 지도 fallback에서도 국가 선택과 도시 탐험 출발이 이어진다', async ({ page }) => {
  await openMenu(page);
  await expect(page.getByTestId('quick-start-cities')).toBeDisabled();
  await selectKorea(page);

  const cities = page.getByTestId('quick-start-cities');
  await expect(cities).toBeEnabled();
  await cities.click();
  await expect(cities).toHaveClass(/is-selected/);
  await expect(page.getByRole('checkbox', { name: '도시' })).toBeChecked();
  await setQuestionCount(page, 3);

  const answer = await start(page);
  await expect(page.locator('.simple-map-question')).toBeVisible();
  await expect(page.getByTestId('typing-language-hud')).toHaveText('한국어 입력');

  for (let index = 0; index < 3; index += 1) {
    await skipCurrent(page);
    if (index < 2) {
      await expect(page.getByLabel('진행 상황')).toContainText(`0${index + 2} / 03`, { timeout: 10_000 });
      await expect(answer).toBeEnabled({ timeout: 10_000 });
    }
  }
  await expect(page.locator('.result-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('question-review')).toBeVisible();
  await expect(page.getByTestId('question-review').locator('.review-row')).toHaveCount(3);
});

test('선택 취소는 지도 대상과 시작 가능 상태를 지우고 재선택하면 복구한다', async ({ page }, testInfo) => {
  await openMenu(page);
  await selectKorea(page);
  await expect(page.getByTestId('start-game')).toBeEnabled();

  if (testInfo.project.name === 'mobile-chromium') {
    // The compact UI clears selection through its world breadcrumb.
    await page.getByRole('navigation', { name: '현재 지리 계층' })
      .getByRole('button', { name: '세계', exact: true }).click();
  } else {
    await page.getByRole('button', { name: '선택 취소', exact: true }).click();
  }
  await expect(page.getByTestId('selected-country-name')).toHaveText('출발 지역을 선택하세요');
  await expect(page.locator('.simple-country.is-target')).toHaveCount(0);
  await expect(page.getByTestId('start-game')).toBeDisabled();
  await expect(page.getByTestId('quick-start-cities')).toBeDisabled();

  await selectKorea(page);
  await expect(page.getByTestId('start-game')).toBeEnabled();
  await expect(page.getByTestId('quick-start-cities')).toBeEnabled();
});

test('기본 OpenFreeMap 스타일 오류는 상태 코드를 보여주고 간단 지도로 복구할 수 있다', async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/styles/liberty', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'test style outage' }),
  }));
  await page.goto('/?e2e=1&debug=1');

  const errorScreen = page.getByRole('heading', { name: '지도를 불러오지 못했습니다' });
  await expect(errorScreen).toBeVisible({ timeout: 20_000 });
  const errorCard = page.locator('.resource-error-card');
  await expect(errorCard).toContainText('지도 스타일');
  await expect(errorCard).toContainText('503');
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();

  await page.getByRole('button', { name: '간단 지도로 계속하기' }).click();
  await expect(page.locator('.simple-map')).toBeVisible();
  await expect(page.getByTestId('selected-country-name')).toHaveText('출발 지역을 선택하세요', { timeout: 20_000 });
  await expect(page.getByLabel('국가 검색')).toBeEnabled();
});

test('진행 중 일시정지는 타이머를 보존하고 복귀 후 게임을 재개한다', async ({ page }) => {
  await openMenu(page);
  await selectKorea(page);
  await chooseQuestionType(page, '국가');
  const answer = await start(page);

  const timer = page.locator('.timer-dial strong');
  await page.getByRole('button', { name: '일시 정지' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('항해 일시 정지');
  // The click can race one final animation-frame tick. Sample only after the
  // modal is visible, then assert that the paused value stays frozen.
  const pausedTime = await timer.textContent();
  await page.waitForTimeout(350);
  await expect(timer).toHaveText(pausedTime ?? '');

  await dialog.getByRole('button', { name: '항해 계속하기' }).click();
  await expect(dialog).toBeHidden();
  await expect(answer).toBeEnabled();
  await expect(page.locator('.phase-chip.playing')).toHaveText('입력 중');
  await finishSingleQuestion(page);
});

test('입력 없이 제한 시간이 끝나면 한 번만 시간 종료로 판정하고 결과로 이동한다', async ({ page }) => {
  await openMenu(page);
  await selectKorea(page);
  await chooseQuestionType(page, '국가');
  // Expert has a real 12s limit in preview builds and no automatic hints.
  // Let the production scheduler expire it without altering browser clocks.
  await page.getByTestId('difficulty-select').selectOption('expert');
  const answer = await start(page);
  await expect(answer).toHaveValue('');
  await expect(page.locator('.verdict-miss')).toContainText('시간이 끝났습니다', { timeout: 15_000 });
  await expect(page.locator('.result-screen')).toBeVisible({ timeout: 10_000 });

  const rows = page.getByTestId('question-review').locator('.review-row');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('대한민국');
  await expect(rows).toContainText('시간 종료');
  await expect(rows).toContainText('남은 시간 0.0초');
  await expect(rows).toHaveClass(/review-miss/);
  await expect(page.getByTestId('question-review').locator('header')).toContainText('0/1');
});

test('결과 화면은 각 문제를 복습하고 저장한 로컬 기록을 다음 실행에서도 보여준다', async ({ page }) => {
  await openMenu(page);
  await selectKorea(page);
  await chooseQuestionType(page, '국가');
  await start(page);
  await finishSingleQuestion(page);

  const review = page.getByTestId('question-review');
  await expect(review).toContainText('문제별 복습');
  await expect(review.locator('.review-row')).toHaveCount(1);
  await expect(review.locator('.review-row')).toContainText('대한민국');

  await page.getByLabel('항해 기록에 이름 남기기').fill('explorer');
  await page.getByRole('button', { name: '기록 저장' }).click();
  await expect(page.getByText('항해 기록이 저장되었습니다.')).toBeVisible();
  await expect(page.locator('.leaderboard-table tbody tr').filter({ hasText: 'explorer' })).toBeVisible();

  // A reload returns to the menu, so start the same partition again and verify
  // that the persisted row is loaded by the result ranking.
  await page.reload();
  await expect(page.getByTestId('selected-country-name')).toHaveText('출발 지역을 선택하세요', { timeout: 20_000 });
  await selectKorea(page);
  await chooseQuestionType(page, '국가');
  await start(page);
  await finishSingleQuestion(page);
  await expect(page.locator('.leaderboard-table tbody tr').filter({ hasText: 'explorer' })).toBeVisible();
});
