import { describe, expect, it } from 'vitest';
import { MAX_AUTH_ATTEMPTS } from '../../src/app-auth';

describe('MAX_AUTH_ATTEMPTS', () => {
  it('is set to 5', () => {
    expect(MAX_AUTH_ATTEMPTS).toBe(5);
  });
});
