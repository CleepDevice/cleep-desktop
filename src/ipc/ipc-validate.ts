/**
 * Runtime Zod validation for renderer → main IPC payloads.
 * Applied in handleInvoke / onRendererSend before user handlers run.
 */

import { z, type ZodError, type ZodType, type ZodTypeAny } from 'zod';
import type {
  InvokeChannel,
  InvokeRequest,
  SendChannel,
  SendPayload,
} from './ipc-contract';

/** Basename only — blocks path traversal used against cache / install filenames. */
const safeBasename = z
  .string()
  .min(1)
  .refine((value) => !value.includes('\0') && !value.includes('..') && !/[\\/]/.test(value), {
    message: 'must be a basename without path separators',
  });

const nonEmptyString = z.string().min(1);

const httpOrHttpsUrl = z.string().refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'must be an http(s) URL' },
);

const isoSourceUrl = z.string().refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:' || protocol === 'file:';
    } catch {
      return false;
    }
  },
  { message: 'must be an http(s) or file URL' },
);

const sha256OrEmpty = z
  .union([z.string().regex(/^[a-fA-F0-9]{64}$/), z.literal(''), z.undefined()])
  .transform((value) => value ?? '');

type SettingsValueSchema =
  | null
  | boolean
  | string
  | number
  | SettingsValueSchema[]
  | { [key: string]: SettingsValueSchema };

const settingsValue: ZodType<SettingsValueSchema> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.string(),
    z.number(),
    z.array(settingsValue),
    z.record(z.string(), settingsValue),
  ]),
);

const settingsObject = z.record(z.string(), settingsValue);

const wifiData = z
  .object({
    network: z.string(),
    security: z.string(),
    password: z.string(),
    hidden: z.boolean(),
  })
  .nullable();

const installData = z.object({
  isoUrl: isoSourceUrl,
  isoSha256: sha256OrEmpty,
  isoFilename: safeBasename,
  isoPath: z.string().optional(),
  drivePath: nonEmptyString,
  wifiData,
  firstRunScriptPath: z.string().optional(),
});

const openDialogOptions = z
  .object({
    title: z.string().optional(),
    filters: z
      .array(
        z.object({
          name: z.string(),
          extensions: z.array(z.string()),
        }),
      )
      .optional(),
    properties: z.array(z.string()).optional(),
    // Custom flags historically sent by the Angular ISO dialog
    openFile: z.boolean().optional(),
    openDirectory: z.boolean().optional(),
    multiSelections: z.boolean().optional(),
    showHiddenFiles: z.boolean().optional(),
  })
  .passthrough();

const authEvent = z.object({
  url: nonEmptyString,
  deviceUuid: nonEmptyString,
  account: nonEmptyString,
  password: z.string(),
});

const loggerMessage = z.object({
  level: z.enum(['no', 'debug', 'info', 'warn', 'error']),
  message: z.string(),
  extra: z.unknown().optional(),
});

const keyValue = z.object({
  key: nonEmptyString,
  value: settingsValue,
});

const downloadFileOptions = z.object({
  url: httpOrHttpsUrl,
  title: z.string().optional(),
});

type InvokeSchemaMap = {
  [C in InvokeChannel]: [InvokeRequest<C>] extends [void] ? null : ZodTypeAny;
};

type SendSchemaMap = {
  [C in SendChannel]: [SendPayload<C>] extends [void] ? null : ZodTypeAny;
};

/**
 * null = channel has no request payload.
 * Every non-void invoke channel must have a schema (compile-time exhaustiveness).
 */
export const INVOKE_REQUEST_SCHEMAS: InvokeSchemaMap = {
  'bus-get-network-config': null,
  // Empty string means automatic interface selection.
  'bus-set-network-interface': z.string(),
  'cache-delete-file': safeBasename,
  'cache-get-infos': null,
  'cache-purge-files': null,
  'devices-delete-device': nonEmptyString,
  'devices-get-ui-state': null,
  'get-changelog': null,
  'get-electron-log-path': null,
  'iso-get-drives': null,
  'iso-get-isos': z.boolean().optional(),
  'iso-get-wifi-networks': null,
  'iso-has-wifi': null,
  'iso-refresh-wifi-networks': null,
  'open-dialog': openDialogOptions,
  'settings-filepath': null,
  'settings-get': nonEmptyString,
  'settings-get-all': null,
  'settings-get-selected': z.array(nonEmptyString),
  'settings-set-all': settingsObject,
  'settings.has': nonEmptyString,
  'update-device-auth': authEvent,
  'updater-check-for-updates': null,
  'updater-get-software-versions': null,
};

export const SEND_PAYLOAD_SCHEMAS: SendSchemaMap = {
  'download-file': downloadFileOptions,
  'download-file-cancel': nonEmptyString,
  'iso-cancel-install': null,
  'iso-start-install': installData,
  'logger-log': loggerMessage,
  'open-electron-logs': null,
  'open-url-in-browser': httpOrHttpsUrl,
  'settings-set': keyValue,
  'updater-quit-and-install': null,
};

export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

export function isParseFailure<T>(result: ParseResult<T>): result is { ok: false; message: string } {
  return result.ok === false;
}

function parseWithSchema<T>(schema: ZodTypeAny | null, raw: unknown): ParseResult<T> {
  if (schema === null) {
    return { ok: true, data: undefined as T };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: formatZodError(parsed.error) };
  }
  return { ok: true, data: parsed.data as T };
}

export function parseInvokeRequest<C extends InvokeChannel>(
  channel: C,
  raw: unknown,
): ParseResult<InvokeRequest<C>> {
  return parseWithSchema(INVOKE_REQUEST_SCHEMAS[channel], raw);
}

export function parseSendPayload<C extends SendChannel>(
  channel: C,
  raw: unknown,
): ParseResult<SendPayload<C>> {
  return parseWithSchema(SEND_PAYLOAD_SCHEMAS[channel], raw);
}

export function invokeChannelHasRequest(channel: InvokeChannel): boolean {
  return INVOKE_REQUEST_SCHEMAS[channel] !== null;
}

export function sendChannelHasPayload(channel: SendChannel): boolean {
  return SEND_PAYLOAD_SCHEMAS[channel] !== null;
}
