/**
 * @deprecated Prefer importing sendToRenderer from './ipc/ipc-main'.
 * Kept as a thin alias so existing call sites keep working during the IPC hardening series.
 */
export { sendToRenderer as sendDataToAngularJs } from '../ipc/ipc-main';
