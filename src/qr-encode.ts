/**
 * Browser IIFE for Angular device-details QR (bundled to html/js/libs/qr-encode.js).
 */
import encodeQR from 'qr';

export type CleepQrApi = {
  /** Encode text as a GIF data URL suitable for ``<img ng-src>``. */
  encodeDataUrl: (text: string, scale?: number) => string;
};

const api: CleepQrApi = {
  encodeDataUrl(text: string, scale = 4): string {
    return encodeQR(String(text || ''), 'data-url', { scale });
  },
};

declare global {
  interface Window {
    CleepQr?: CleepQrApi;
  }
}

window.CleepQr = api;
