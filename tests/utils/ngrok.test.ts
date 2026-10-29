import { describe, expect, it } from 'vitest';
import {
  NGROK_HOST_URL_FILTERS,
  NGROK_SKIP_BROWSER_WARNING_HEADER,
} from '../../src/utils/ngrok';

describe('ngrok utils', () => {
  it('exports skip-browser-warning header name', () => {
    expect(NGROK_SKIP_BROWSER_WARNING_HEADER).toBe('ngrok-skip-browser-warning');
  });

  it('covers current and legacy ngrok host patterns', () => {
    expect(NGROK_HOST_URL_FILTERS).toEqual(
      expect.arrayContaining([
        '*://*.ngrok-free.app/*',
        '*://*.ngrok-free.dev/*',
        '*://*.ngrok.app/*',
        '*://*.ngrok.io/*',
      ]),
    );
  });
});
