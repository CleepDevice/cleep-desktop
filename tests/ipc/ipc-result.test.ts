import { describe, expect, it } from 'vitest';
import { ipcErr, ipcOk, isIpcOk } from '../../src/ipc/ipc-result';

describe('ipc-result', () => {
  it('builds ok and err envelopes', () => {
    expect(ipcOk({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
    expect(ipcErr('CODE', 'msg')).toEqual({ ok: false, error: { code: 'CODE', message: 'msg' } });
  });

  it('narrows with isIpcOk', () => {
    const ok = ipcOk('x');
    const err = ipcErr('E', 'fail');
    expect(isIpcOk(ok)).toBe(true);
    expect(isIpcOk(err)).toBe(false);
    if (isIpcOk(ok)) {
      expect(ok.data).toBe('x');
    }
  });
});
