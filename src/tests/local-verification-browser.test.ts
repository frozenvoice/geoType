import { describe, expect, it } from 'vitest';
import { localChromiumLaunchOptions } from '../../scripts/verification-environment';

describe('explicit local Chromium selection', () => {
  it('keeps the Playwright default unless an executable is explicitly selected', () => {
    expect(localChromiumLaunchOptions({})).toEqual({});
    expect(localChromiumLaunchOptions({ GEOTYPE_CHROMIUM_EXECUTABLE: '  ' })).toEqual({});
    expect(localChromiumLaunchOptions({ GEOTYPE_CHROMIUM_EXECUTABLE: ' C:\\Chrome\\chrome.exe ' })).toEqual({ executablePath: 'C:\\Chrome\\chrome.exe' });
  });
});
