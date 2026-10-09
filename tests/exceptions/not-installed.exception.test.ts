import { describe, expect, it } from 'vitest';
import { NotInstalledException } from '../../src/exceptions/not-installed.exception';

describe('NotInstalledException', () => {
  it('stores application name and default message', () => {
    const error = new NotInstalledException('balena');

    expect(error).toBeInstanceOf(Error);
    expect(error.application).toBe('balena');
    expect(error.message).toBe('NotInstalled');
  });
});
