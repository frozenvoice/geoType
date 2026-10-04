import { expect, test } from '@playwright/test';

// Keep the gameplay suite deterministic and independent from MapLibre's network
// resources. The DOM renderer still exercises the same catalog, session, input,
// and result paths while the OpenFreeMap/live-map QA is covered separately.
const testUrl = '/?mapProvider=test&renderer=dom&e2e=1&debug=1';

const COUNTRY_IDS = {
  korea: 'natural-earth:country:KOR',
  japan: 'natural-earth:country:JPN',
};

async function openMenu(page) {
  await page.goto(testUrl);
  await expect(page.getByTestId('selected-country-name')).toHaveText('출발 지역을 선택하세요', {
    timeout: 20_000,
  });
  await expect(page.locator('.simple-map')).toHaveAttribute('data-map-provider', 'simple');
  await expect(page.getByTestId('map-debug-status')).toContainText('simple');
}

async function selectCountry(page, search, countryId, expectedName) {
  const searchInput = page.getByLabel('국가 검색');
  await searchInput.fill(search);
  const country = page.locator(`[data-country-id="${countryId}"]`);
  await expect(country).toBeVisible();
  await country.click();
  await expect(page.getByTestId('selected-country-name')).toHaveText(expectedName);
}

async function chooseQuestionType(page, typeLabel) {
  const fieldset = page.locator('.geo-type-fieldset');
  await expect(fieldset).toBeVisible();
  const checkboxes = fieldset.getByRole('checkbox');
  const count = await checkboxes.count();
  for (let index = 0; index < count; index += 1) {
    const checkbox = checkboxes.nth(index);
    const label = (await checkbox.locator('..').innerText()).trim();
    if (label !== typeLabel && await checkbox.isChecked()) await checkbox.locator('..').click();
  }
  const desired = fieldset.getByRole('checkbox', { name: new RegExp(`^${typeLabel}$`) });
  if (!(await desired.isChecked())) await desired.locator('..').click();
  await expect(desired).toBeChecked();
  // The scope summary is the commit point for React's derived candidate list.
  // Waiting for it avoids racing the preset/type effect when a language radio
  // was changed immediately before this helper.
  await expect(page.getByTestId('start-game')).toContainText('1문제 시작');
}

async function startOneQuestion(page, options = {}) {
  if (options.type) await chooseQuestionType(page, options.type);
  await page.getByTestId('start-game').click();
  const answer = page.getByRole('textbox', { name: '목표 지명 입력' });
  await expect(page.getByLabel('진행 상황')).toContainText('01 / 01', {
    timeout: 15_000,
  });
  await expect(answer).toBeEnabled({ timeout: 15_000 });
  return answer;
}

async function expectResult(page) {
  await expect(page.locator('.result-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: '기록 저장' })).toBeVisible();
}

async function expectVerdict(page, kind) {
  const verdict = page.locator(`.verdict-${kind}`);
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText(kind === 'correct' ? /정답|Correct/ : /오답|Incorrect|시간/);
}

async function saveScore(page, nickname) {
  await page.getByLabel('항해 기록에 이름 남기기').fill(nickname);
  await page.getByRole('button', { name: '기록 저장' }).click();
  await expect(page.getByText('항해 기록이 저장되었습니다.')).toBeVisible();
  await expect(page.locator('.leaderboard-table tbody tr').filter({ hasText: nickname })).toBeVisible();
}

async function returnToMenu(page) {
  await page.getByRole('button', { name: /메뉴로 돌아가기/ }).click();
  await expect(page.getByTestId('selected-country-name')).toBeVisible({ timeout: 10_000 });
}

async function chooseRadio(scope, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const input = scope.getByRole('radio', { name: new RegExp(`^${escapedLabel}(?:\\s|$)`) });
  await input.locator('..').click();
  await expect(input).toBeChecked();
}

async function expectHudLanguage(page, testInfo, label) {
  await expect(page.getByTestId('typing-language-hud')).toHaveText(label);
  const mobileChip = page.getByTestId('typing-language-hud-mobile');
  await expect(mobileChip).toHaveText(label);
  if (testInfo.project.name === 'mobile-chromium') {
    await expect(mobileChip).toBeVisible();
  } else {
    await expect(mobileChip).toBeHidden();
  }
}

function screenshotPath(testInfo, filename) {
  return testInfo.project.name === 'mobile-chromium'
    ? `docs/screenshots/mobile/${filename}`
    : `docs/screenshots/${filename}`;
}

async function capture(page, testInfo, filename, focus) {
  if (focus) await focus.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath(testInfo, filename) });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.indexedDB.deleteDatabase('geotype-geodata');
  });
});

test('기본값은 한국어 strict이며 세계 범위에서는 현지어를 명시적으로 차단한다', async ({ page }, testInfo) => {
  await openMenu(page);
  await selectCountry(page, '대한민국', COUNTRY_IDS.korea, '대한민국');

  const languageGroup = page.getByRole('radiogroup', { name: '타이핑 언어' });
  await expect(languageGroup.getByLabel('한국어')).toBeChecked();
  await expect(page.getByLabel('지정된 언어만')).toBeChecked();
  await expect(page.locator('.start-settings-summary')).toContainText('언어 한국어');
  await expect(page.locator('.start-settings-summary')).toContainText('판정 지정된 언어만');
  await capture(page, testInfo, 'language-settings-korean.png', languageGroup);

  await chooseRadio(languageGroup, 'English');
  await expect(page.locator('.start-settings-summary')).toContainText('언어 English');
  await capture(page, testInfo, 'language-settings-english.png', languageGroup);

  await page.locator('[data-scope-kind="world"]').click();
  const worldLanguages = page.getByRole('radiogroup', { name: '타이핑 언어' });
  const native = worldLanguages.getByLabel('현지어');
  await expect(native).toBeDisabled();
  await expect(native.locator('..')).toContainText(
    '여러 문자 체계가 섞여 한 게임 중 입력기를 반복 변경해야 합니다.',
  );
  await expect(worldLanguages.getByLabel('한국어')).toBeEnabled();
  await expect(worldLanguages.getByLabel('English')).toBeEnabled();
  await expect(worldLanguages.getByLabel('로마자')).toBeEnabled();
  await expect(worldLanguages.getByLabel('일본어 한자')).toHaveCount(0);
  await expect(worldLanguages.getByLabel('일본어 읽기')).toHaveCount(0);
  await capture(page, testInfo, 'unavailable-language-warning.png', worldLanguages);
});

test('대한민국 한국어 strict는 영어를 자동 정답 처리하지 않고 한국어만 인정한다', async ({ page }, testInfo) => {
  await openMenu(page);
  await selectCountry(page, 'KR', COUNTRY_IDS.korea, '대한민국');

  await expect(page.getByLabel('한국어')).toBeChecked();
  await expect(page.getByLabel('지정된 언어만')).toBeChecked();
  const answer = await startOneQuestion(page, { type: '국가' });
  await expectHudLanguage(page, testInfo, '한국어 입력');
  await expect(answer).toHaveAttribute('lang', 'ko');

  await answer.fill('South Korea');
  await answer.press('Enter');
  await expectVerdict(page, 'miss');
  await expect(page.getByRole('status').filter({ hasText: '대한민국' })).toBeVisible();
  await expectResult(page);

  await page.getByRole('button', { name: /같은 설정으로 재도전/ }).click();
  const retryAnswer = page.getByRole('textbox', { name: '목표 지명 입력' });
  await expect(retryAnswer).toBeEnabled({ timeout: 15_000 });
  await retryAnswer.fill('대한민국');
  await expectVerdict(page, 'correct');
  await expect(page.getByRole('status').filter({ hasText: '대한민국' })).toBeVisible();
  await expectResult(page);
});

test('일본어 한자 모드는 한자 힌트를 사용하고 IME 조합 중 Enter를 무시한다', async ({ page }, testInfo) => {
  await openMenu(page);
  await selectCountry(page, 'JPN', COUNTRY_IDS.japan, '일본');

  const languageGroup = page.getByRole('radiogroup', { name: '타이핑 언어' });
  await expect(languageGroup.getByLabel('일본어 한자')).toBeVisible();
  await expect(languageGroup.getByLabel('일본어 읽기')).toBeVisible();
  await expect(languageGroup.getByLabel('현지어')).toHaveCount(0);
  await capture(page, testInfo, 'japan-language-options.png', languageGroup);

  // Lock the scope before switching typing language so the country-only
  // intent cannot race the browse screen's default child-type effect.
  await chooseQuestionType(page, '국가');
  await chooseRadio(languageGroup, '일본어 한자');
  const answer = await startOneQuestion(page);
  await expectHudLanguage(page, testInfo, '日本語・漢字');
  await expect(answer).toHaveAttribute('lang', 'ja');
  await expect(page.getByTestId('hint-mask').locator('span')).toHaveCount(2);

  // Normal mode reveals its first hint at 7s in preview builds; only dev E2E
  // sessions halve the timer. Keep this assertion valid for both servers.
  await expect(page.getByTestId('hint-mask')).toContainText('日', { timeout: 10_000 });
  await expect(page.getByTestId('hint-mask')).not.toContainText('일');
  await capture(page, testInfo, 'japan-kanji-question.png', page.locator('.typing-console'));

  await answer.dispatchEvent('compositionstart', { data: 'に' });
  await answer.fill('にほん');
  await answer.press('Enter');
  await expect(answer).toBeEnabled();
  await expect(page.locator('.verdict')).toHaveCount(0);

  await answer.fill('日本');
  await answer.dispatchEvent('compositionend', { data: '日本' });
  await expectVerdict(page, 'correct');
  await expect(page.getByRole('status').filter({ hasText: '日本' })).toBeVisible();
  await expectResult(page);
});

test('일본어 읽기 모드는 히라가나와 설정된 가타카나 비교를 모두 인정한다', async ({ page }, testInfo) => {
  await openMenu(page);
  await selectCountry(page, '일본', COUNTRY_IDS.japan, '일본');
  await chooseQuestionType(page, '국가');
  await chooseRadio(page.getByRole('radiogroup', { name: '타이핑 언어' }), '일본어 읽기');

  let answer = await startOneQuestion(page);
  await expectHudLanguage(page, testInfo, '日本語・読み');
  await expect(page.getByTestId('hint-mask').locator('span')).toHaveCount(3);
  await capture(page, testInfo, 'japan-reading-question.png', page.locator('.typing-console'));
  await answer.fill('にほん');
  await expectVerdict(page, 'correct');
  await expectResult(page);

  await page.getByRole('button', { name: /같은 설정으로 재도전/ }).click();
  answer = page.getByRole('textbox', { name: '목표 지명 입력' });
  await expect(answer).toBeEnabled({ timeout: 15_000 });
  await answer.fill('ニホン');
  await expectVerdict(page, 'correct');
  await expectResult(page);
});

test('casual 별칭은 허용하지만 strict 및 다른 타이핑 언어 랭킹과 섞이지 않는다', async ({ page }, testInfo) => {
  await openMenu(page);
  await selectCountry(page, 'KOR', COUNTRY_IDS.korea, '대한민국');

  let answer = await startOneQuestion(page, { type: '국가' });
  await answer.fill('대한민국');
  await expectResult(page);
  await saveScore(page, 'strict-user');

  await returnToMenu(page);
  await selectCountry(page, '대한민국', COUNTRY_IDS.korea, '대한민국');
  await chooseQuestionType(page, '국가');
  await chooseRadio(page.locator('.answer-policy-fieldset'), '다른 표기와 별칭도 허용');
  await expect(page.locator('.answer-policy-fieldset')).toContainText('캐주얼 기록으로 저장됩니다.');
  await capture(page, testInfo, 'casual-answer-policy.png', page.locator('.answer-policy-fieldset'));

  answer = await startOneQuestion(page);
  await answer.fill('South Korea');
  await expectVerdict(page, 'correct');
  await expectResult(page);
  const rankingFilter = page.getByTestId('ranking-language-filter');
  await expect(rankingFilter).toContainText('한국어');
  await expect(rankingFilter).toContainText('다른 표기와 별칭도 허용');
  await expect(page.getByText('strict-user', { exact: true })).toHaveCount(0);
  await saveScore(page, 'casual-user');
  await capture(page, testInfo, 'ranking-language-filter.png', page.locator('.result-ranking'));

  await returnToMenu(page);
  await selectCountry(page, 'KR', COUNTRY_IDS.korea, '대한민국');
  await chooseQuestionType(page, '국가');
  await chooseRadio(page.getByRole('radiogroup', { name: '타이핑 언어' }), 'English');
  await expect(page.getByLabel('다른 표기와 별칭도 허용')).toBeChecked();
  answer = await startOneQuestion(page);
  await answer.fill('South Korea');
  await expectResult(page);
  await expect(page.getByTestId('ranking-language-filter')).toContainText('English');
  await expect(page.getByText('strict-user', { exact: true })).toHaveCount(0);
  await expect(page.getByText('casual-user', { exact: true })).toHaveCount(0);
});
