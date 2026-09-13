import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserSettings, saveBrowserSettings } from '../game/store/settings';
import { loadBrowserLanguageSettings, saveBrowserLanguageSettings } from '../language/settings';
import { LocalStorageLeaderboardRepository } from '../leaderboard/LocalStorageLeaderboardRepository';

describe('restricted browser storage', () => {
  afterEach(() => vi.restoreAllMocks());
  it('keeps the game available when even the localStorage getter is denied', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    expect(loadBrowserSettings().muted).toBe(true);
    expect(() => saveBrowserSettings({ muted: true, reducedMotion: true })).not.toThrow();
    expect(loadBrowserLanguageSettings()).toEqual({ uiLocale: 'ko', typingLanguage: 'ko', answerPolicy: 'strict' });
    expect(saveBrowserLanguageSettings(loadBrowserLanguageSettings())).toBe(false);
    const repository = new LocalStorageLeaderboardRepository();
    await expect(repository.getTopEntries({ topicId: 'world', dataVersion: '1', difficulty: 'normal', typingLanguage: 'ko', answerPolicy: 'strict', languageDataVersion: '1' })).rejects.toThrow('로컬 랭킹');
  });
});
