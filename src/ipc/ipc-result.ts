/**
 * Uniform invoke envelope.
 * Success: { ok: true, data }
 * Failure: { ok: false, error: { code, message } }
 */

export type IpcErrorBody = {
  code: string;
  message: string;
};

export type IpcOk<T> = {
  ok: true;
  data: T;
};

export type IpcErr = {
  ok: false;
  error: IpcErrorBody;
};

export type IpcResult<T> = IpcOk<T> | IpcErr;

export function ipcOk<T>(data: T): IpcOk<T> {
  return { ok: true, data };
}

export function ipcErr(code: string, message: string): IpcErr {
  return { ok: false, error: { code, message } };
}

export function isIpcOk<T>(result: IpcResult<T>): result is IpcOk<T> {
  return result.ok === true;
}
