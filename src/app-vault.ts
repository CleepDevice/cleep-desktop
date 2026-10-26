import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { App, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { appLogger } from './app-logger';
import {
  VaultEnableResult,
  VaultError,
  VaultSecret,
  VaultStatus,
} from './app-vault.types';
import { handleInvoke, ipcErr, ipcOk, sendToRenderer } from './ipc/ipc-main';
import {
  existsInside,
  mkdirInside,
  readFileInside,
  readFileInsideUtf8,
  unlinkInside,
  writeFileInside,
} from './utils/safe-fs';
import { resolvePathInside } from './utils/safe-path';

const VAULT_VERSION = 1;
const MIN_PASSPHRASE_LENGTH = 8;
const RECOVERY_CODE_COUNT = 8;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

type KdfParams = {
  algo: 'scrypt';
  salt: string;
  N: number;
  r: number;
  p: number;
};

type RecoverySlot = {
  id: string;
  kdf: KdfParams;
  wrappedDek: string;
};

type VaultMetaFile = {
  version: number;
  enabled: boolean;
  kdf: KdfParams;
  wrappedDek: string;
  recovery: RecoverySlot[];
  createdAt: number;
  updatedAt: number;
};

type VaultIndexEntry = {
  id: string;
  key: string;
  createdAt: number;
  updatedAt: number;
};

type VaultIndexFile = {
  entries: VaultIndexEntry[];
};

type UnlockWaiter = {
  resolve: () => void;
  reject: (error: VaultError) => void;
};

class AppVault {
  private vaultRoot: string | null = null;
  private blobsDir: string | null = null;
  private metaPath: string | null = null;
  private indexPath: string | null = null;
  private meta: VaultMetaFile | null = null;
  private entries = new Map<string, VaultIndexEntry>();
  private dek: Buffer | null = null;
  private configured = false;
  private window: BrowserWindow | null = null;
  private unlockWaiters: UnlockWaiter[] = [];
  private unlockPromptOpen = false;

  public configure(app: App): void {
    if (this.configured) {
      return;
    }

    this.vaultRoot = path.join(app.getPath('userData'), 'vault');
    this.blobsDir = path.join(this.vaultRoot, 'blobs');
    this.metaPath = path.join(this.vaultRoot, 'meta.json');
    this.indexPath = path.join(this.vaultRoot, 'index.json');

    // Register IPC first so the renderer never hits "No handler registered"
    // even if store loading fails.
    this.addIpcs();
    this.configured = true;

    try {
      this.ensureStore();
      this.loadMeta();
      this.loadIndex();
    } catch (error) {
      appLogger.error('Vault store initialization failed; IPC remains available', { error });
      this.meta = null;
      this.entries.clear();
      this.dek = null;
    }

    appLogger.info('Vault configured', {
      path: this.vaultRoot,
      enabled: this.meta?.enabled === true,
    });
  }

  public getStatus(): VaultStatus {
    this.assertConfigured();
    return {
      enabled: this.meta?.enabled === true,
      unlocked: this.dek !== null,
      recoveryCodesRemaining: this.meta?.recovery?.length ?? 0,
    };
  }

  public isEnabled(): boolean {
    return this.getStatus().enabled;
  }

  public isUnlocked(): boolean {
    return this.dek !== null;
  }

  /** Attach the main BrowserWindow so unlock prompts can be shown. */
  public setWindow(window: BrowserWindow): void {
    this.window = window;
  }

  /**
   * Ensure the vault is unlocked for this session.
   * If locked, prompts the UI once and waits until unlock / recover / cancel.
   */
  public ensureUnlocked(): Promise<void> {
    this.assertConfigured();
    if (!this.meta?.enabled) {
      return Promise.reject(new VaultError('VAULT_DISABLED', 'Vault is not enabled'));
    }
    if (this.dek) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.unlockWaiters.push({ resolve, reject });
      this.promptUnlock();
    });
  }

  /** Called by the unlock modal when the user closes it without unlocking. */
  public dismissUnlockRequest(): void {
    this.rejectUnlockWaiters(
      new VaultError('VAULT_UNLOCK_CANCELLED', 'Vault unlock cancelled'),
    );
  }

  /** Enable vault with a passphrase. Returns recovery codes (shown once). */
  public enable(passphrase: string): VaultEnableResult {
    this.assertConfigured();
    this.assertPassphraseStrength(passphrase);

    if (this.meta?.enabled) {
      throw new VaultError('VAULT_ALREADY_ENABLED', 'Vault is already enabled');
    }

    const dek = randomBytes(KEY_LENGTH);
    const kdf = createKdfParams();
    const kek = deriveKey(passphrase, kdf);
    const wrappedDek = wrapKey(dek, kek);

    const recoveryCodes: string[] = [];
    const recovery: RecoverySlot[] = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
      const code = generateRecoveryCode();
      const recoveryKdf = createKdfParams();
      const recoveryKek = deriveKey(normalizeRecoveryCode(code), recoveryKdf);
      recoveryCodes.push(code);
      recovery.push({
        id: uuidv4(),
        kdf: recoveryKdf,
        wrappedDek: wrapKey(dek, recoveryKek),
      });
    }

    const now = Date.now();
    this.meta = {
      version: VAULT_VERSION,
      enabled: true,
      kdf,
      wrappedDek,
      recovery,
      createdAt: now,
      updatedAt: now,
    };
    this.persistMeta();
    this.dek = dek;
    appLogger.info('Vault enabled');
    this.resolveUnlockWaiters();

    return {
      status: this.getStatus(),
      recoveryCodes,
    };
  }

  /** Disable vault and wipe all stored secrets. Requires current passphrase. */
  public disable(passphrase: string): VaultStatus {
    this.assertConfigured();
    this.assertEnabled();
    this.unlockWithPassphrase(passphrase);
    this.wipeVaultData();
    this.rejectUnlockWaiters(new VaultError('VAULT_DISABLED', 'Vault was disabled'));
    appLogger.info('Vault disabled and wiped');
    return this.getStatus();
  }

  public unlock(passphrase: string): VaultStatus {
    this.assertConfigured();
    this.assertEnabled();
    this.unlockWithPassphrase(passphrase);
    appLogger.info('Vault unlocked');
    this.resolveUnlockWaiters();
    return this.getStatus();
  }

  public lock(): VaultStatus {
    this.assertConfigured();
    this.dek = null;
    appLogger.info('Vault locked');
    return this.getStatus();
  }

  public changePassphrase(currentPassphrase: string, nextPassphrase: string): VaultStatus {
    this.assertConfigured();
    this.assertEnabled();
    this.assertPassphraseStrength(nextPassphrase);
    this.unlockWithPassphrase(currentPassphrase);

    const dek = this.requireDek();
    const kdf = createKdfParams();
    const kek = deriveKey(nextPassphrase, kdf);
    this.meta!.kdf = kdf;
    this.meta!.wrappedDek = wrapKey(dek, kek);
    this.meta!.updatedAt = Date.now();
    this.persistMeta();
    appLogger.info('Vault passphrase changed');
    return this.getStatus();
  }

  /**
   * Unlock with a recovery code and set a new passphrase.
   * Consumes the used recovery code. Returns a fresh recovery code set.
   */
  public recover(recoveryCode: string, newPassphrase: string): VaultEnableResult {
    this.assertConfigured();
    this.assertEnabled();
    this.assertPassphraseStrength(newPassphrase);

    const normalized = normalizeRecoveryCode(recoveryCode);
    const meta = this.meta!;
    let unlockedDek: Buffer | null = null;
    let usedSlotId: string | null = null;

    for (const slot of meta.recovery) {
      try {
        const kek = deriveKey(normalized, slot.kdf);
        unlockedDek = unwrapKey(slot.wrappedDek, kek);
        usedSlotId = slot.id;
        break;
      } catch {
        // try next slot
      }
    }

    if (!unlockedDek || !usedSlotId) {
      throw new VaultError('VAULT_INVALID_RECOVERY_CODE', 'Invalid recovery code');
    }

    const kdf = createKdfParams();
    const kek = deriveKey(newPassphrase, kdf);
    meta.kdf = kdf;
    meta.wrappedDek = wrapKey(unlockedDek, kek);
    meta.recovery = meta.recovery.filter((slot) => slot.id !== usedSlotId);

    const recoveryCodes: string[] = [];
    const recovery: RecoverySlot[] = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
      const code = generateRecoveryCode();
      const recoveryKdf = createKdfParams();
      const recoveryKek = deriveKey(normalizeRecoveryCode(code), recoveryKdf);
      recoveryCodes.push(code);
      recovery.push({
        id: uuidv4(),
        kdf: recoveryKdf,
        wrappedDek: wrapKey(unlockedDek, recoveryKek),
      });
    }
    meta.recovery = recovery;
    meta.updatedAt = Date.now();
    this.persistMeta();
    this.dek = unlockedDek;
    appLogger.info('Vault recovered with recovery code');
    this.resolveUnlockWaiters();

    return {
      status: this.getStatus(),
      recoveryCodes,
    };
  }

  /** Regenerate recovery codes (requires unlocked vault + passphrase). */
  public regenerateRecoveryCodes(passphrase: string): VaultEnableResult {
    this.assertConfigured();
    this.assertEnabled();
    this.unlockWithPassphrase(passphrase);
    const dek = this.requireDek();

    const recoveryCodes: string[] = [];
    const recovery: RecoverySlot[] = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
      const code = generateRecoveryCode();
      const recoveryKdf = createKdfParams();
      const recoveryKek = deriveKey(normalizeRecoveryCode(code), recoveryKdf);
      recoveryCodes.push(code);
      recovery.push({
        id: uuidv4(),
        kdf: recoveryKdf,
        wrappedDek: wrapKey(dek, recoveryKek),
      });
    }

    this.meta!.recovery = recovery;
    this.meta!.updatedAt = Date.now();
    this.persistMeta();
    appLogger.info('Vault recovery codes regenerated');

    return {
      status: this.getStatus(),
      recoveryCodes,
    };
  }

  /** Main-process API: store a secret by opaque key (vault must already be unlocked). */
  public putSecret(key: string, secret: VaultSecret): void {
    this.assertReadyForSecrets();
    const normalizedKey = normalizeSecretKey(key);
    const existing = [...this.entries.values()].find((entry) => entry.key === normalizedKey);
    const now = Date.now();
    const id = existing?.id ?? uuidv4();
    this.writeBlob(id, secret);
    this.entries.set(id, {
      id,
      key: normalizedKey,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    this.persistIndex();
    appLogger.debug('Vault secret stored', { key: normalizedKey });
  }

  /** Unlock if needed, then store a secret. */
  public async putSecretAsync(key: string, secret: VaultSecret): Promise<void> {
    await this.ensureUnlocked();
    this.putSecret(key, secret);
  }

  /** Main-process API: read a secret by opaque key (vault must already be unlocked). */
  public getSecret(key: string): VaultSecret {
    this.assertReadyForSecrets();
    const entry = [...this.entries.values()].find((item) => item.key === normalizeSecretKey(key));
    if (!entry) {
      throw new VaultError('VAULT_ENTRY_NOT_FOUND', `Vault secret not found: ${key}`);
    }
    return this.readBlob(entry.id);
  }

  /** Unlock if needed, then read a secret. */
  public async getSecretAsync(key: string): Promise<VaultSecret> {
    await this.ensureUnlocked();
    return this.getSecret(key);
  }

  public hasSecret(key: string): boolean {
    this.assertConfigured();
    if (!this.meta?.enabled) {
      return false;
    }
    return [...this.entries.values()].some((entry) => entry.key === normalizeSecretKey(key));
  }

  public deleteSecret(key: string): boolean {
    this.assertReadyForSecrets();
    const entry = [...this.entries.values()].find((item) => item.key === normalizeSecretKey(key));
    if (!entry) {
      return false;
    }
    this.entries.delete(entry.id);
    this.deleteBlob(entry.id);
    this.persistIndex();
    appLogger.debug('Vault secret deleted', { key: entry.key });
    return true;
  }

  /** Unlock if needed, then delete a secret. */
  public async deleteSecretAsync(key: string): Promise<boolean> {
    await this.ensureUnlocked();
    return this.deleteSecret(key);
  }

  public listSecretKeys(): string[] {
    this.assertConfigured();
    if (!this.meta?.enabled) {
      return [];
    }
    return [...this.entries.values()].map((entry) => entry.key).sort();
  }

  private addIpcs(): void {
    handleInvoke('vault-get-status', () => {
      try {
        return ipcOk(this.getStatus());
      } catch (error) {
        return this.toIpcError(error, 'VAULT_STATUS_FAILED', 'Unable to get vault status');
      }
    });

    handleInvoke('vault-enable', (_event, request) => {
      try {
        return ipcOk(this.enable(request.passphrase));
      } catch (error) {
        return this.toIpcError(error, 'VAULT_ENABLE_FAILED', 'Unable to enable vault');
      }
    });

    handleInvoke('vault-disable', (_event, request) => {
      try {
        return ipcOk(this.disable(request.passphrase));
      } catch (error) {
        return this.toIpcError(error, 'VAULT_DISABLE_FAILED', 'Unable to disable vault');
      }
    });

    handleInvoke('vault-unlock', (_event, request) => {
      try {
        return ipcOk(this.unlock(request.passphrase));
      } catch (error) {
        return this.toIpcError(error, 'VAULT_UNLOCK_FAILED', 'Unable to unlock vault');
      }
    });

    handleInvoke('vault-lock', () => {
      try {
        return ipcOk(this.lock());
      } catch (error) {
        return this.toIpcError(error, 'VAULT_LOCK_FAILED', 'Unable to lock vault');
      }
    });

    handleInvoke('vault-change-passphrase', (_event, request) => {
      try {
        return ipcOk(this.changePassphrase(request.currentPassphrase, request.nextPassphrase));
      } catch (error) {
        return this.toIpcError(error, 'VAULT_CHANGE_PASSPHRASE_FAILED', 'Unable to change vault passphrase');
      }
    });

    handleInvoke('vault-recover', (_event, request) => {
      try {
        return ipcOk(this.recover(request.recoveryCode, request.newPassphrase));
      } catch (error) {
        return this.toIpcError(error, 'VAULT_RECOVER_FAILED', 'Unable to recover vault');
      }
    });

    handleInvoke('vault-regenerate-recovery-codes', (_event, request) => {
      try {
        return ipcOk(this.regenerateRecoveryCodes(request.passphrase));
      } catch (error) {
        return this.toIpcError(error, 'VAULT_REGENERATE_FAILED', 'Unable to regenerate recovery codes');
      }
    });

    handleInvoke('vault-dismiss-unlock', () => {
      try {
        this.dismissUnlockRequest();
        return ipcOk(this.getStatus());
      } catch (error) {
        return this.toIpcError(error, 'VAULT_DISMISS_FAILED', 'Unable to dismiss vault unlock');
      }
    });

    handleInvoke('vault-ensure-unlocked', async () => {
      try {
        await this.ensureUnlocked();
        return ipcOk(this.getStatus());
      } catch (error) {
        return this.toIpcError(error, 'VAULT_LOCKED', 'Unable to unlock vault');
      }
    });
  }

  private promptUnlock(): void {
    if (this.unlockPromptOpen) {
      return;
    }
    if (!this.window || this.window.isDestroyed()) {
      this.rejectUnlockWaiters(
        new VaultError('VAULT_LOCKED', 'Vault is locked and no UI is available to unlock it'),
      );
      return;
    }

    this.unlockPromptOpen = true;
    sendToRenderer(this.window, 'vault-unlock-required');
  }

  private resolveUnlockWaiters(): void {
    this.unlockPromptOpen = false;
    const waiters = this.unlockWaiters.splice(0);
    for (const waiter of waiters) {
      waiter.resolve();
    }
  }

  private rejectUnlockWaiters(error: VaultError): void {
    this.unlockPromptOpen = false;
    const waiters = this.unlockWaiters.splice(0);
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }

  private toIpcError(error: unknown, fallbackCode: string, fallbackMessage: string) {
    if (error instanceof VaultError) {
      appLogger.warn('Vault operation failed', { code: error.code, message: error.message });
      return ipcErr(error.code, error.message);
    }
    appLogger.error(fallbackMessage, { error });
    return ipcErr(fallbackCode, fallbackMessage);
  }

  private assertConfigured(): void {
    if (!this.configured || !this.vaultRoot || !this.blobsDir || !this.metaPath || !this.indexPath) {
      throw new VaultError('VAULT_NOT_CONFIGURED', 'Vault is not configured');
    }
  }

  private assertEnabled(): void {
    if (!this.meta?.enabled) {
      throw new VaultError('VAULT_DISABLED', 'Vault is not enabled');
    }
  }

  private assertReadyForSecrets(): void {
    this.assertConfigured();
    this.assertEnabled();
    if (!this.dek) {
      throw new VaultError('VAULT_LOCKED', 'Vault is locked');
    }
  }

  private assertPassphraseStrength(passphrase: string): void {
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
      throw new VaultError(
        'VAULT_WEAK_PASSPHRASE',
        `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`,
      );
    }
  }

  private requireDek(): Buffer {
    if (!this.dek) {
      throw new VaultError('VAULT_LOCKED', 'Vault is locked');
    }
    return this.dek;
  }

  private unlockWithPassphrase(passphrase: string): void {
    const meta = this.meta;
    if (!meta?.enabled) {
      throw new VaultError('VAULT_DISABLED', 'Vault is not enabled');
    }
    try {
      const kek = deriveKey(passphrase, meta.kdf);
      this.dek = unwrapKey(meta.wrappedDek, kek);
    } catch {
      throw new VaultError('VAULT_INVALID_PASSPHRASE', 'Invalid vault passphrase');
    }
  }

  private wipeVaultData(): void {
    const { vaultRoot, blobsDir } = this.requirePaths();
    for (const entry of this.entries.values()) {
      this.deleteBlob(entry.id);
    }
    this.entries.clear();
    this.persistIndex();

    // Remove any leftover blob files
    try {
      if (fs.existsSync(blobsDir)) {
        for (const name of fs.readdirSync(blobsDir)) {
          unlinkInside(vaultRoot, resolvePathInside(blobsDir, name));
        }
      }
    } catch (error) {
      appLogger.warn('Unable to fully purge vault blobs', { error });
    }

    this.meta = null;
    this.dek = null;
    if (existsInside(vaultRoot, this.metaPath!)) {
      unlinkInside(vaultRoot, this.metaPath!);
    }
  }

  private ensureStore(): void {
    const { vaultRoot, blobsDir } = this.requirePaths();
    if (!existsInside(vaultRoot, vaultRoot)) {
      mkdirInside(vaultRoot, vaultRoot, { recursive: true });
    }
    if (!existsInside(vaultRoot, blobsDir)) {
      mkdirInside(vaultRoot, blobsDir, { recursive: true });
    }
  }

  private requirePaths(): { vaultRoot: string; blobsDir: string; metaPath: string; indexPath: string } {
    if (!this.vaultRoot || !this.blobsDir || !this.metaPath || !this.indexPath) {
      throw new VaultError('VAULT_NOT_CONFIGURED', 'Vault paths are not set');
    }
    return {
      vaultRoot: this.vaultRoot,
      blobsDir: this.blobsDir,
      metaPath: this.metaPath,
      indexPath: this.indexPath,
    };
  }

  private loadMeta(): void {
    const { vaultRoot, metaPath } = this.requirePaths();
    if (!existsInside(vaultRoot, metaPath)) {
      this.meta = null;
      return;
    }
    try {
      const raw = readFileInsideUtf8(vaultRoot, metaPath);
      const parsed = JSON.parse(raw) as VaultMetaFile;
      if (parsed?.enabled && parsed.wrappedDek && parsed.kdf) {
        this.meta = {
          version: parsed.version || VAULT_VERSION,
          enabled: true,
          kdf: parsed.kdf,
          wrappedDek: parsed.wrappedDek,
          recovery: Array.isArray(parsed.recovery) ? parsed.recovery : [],
          createdAt: Number(parsed.createdAt) || Date.now(),
          updatedAt: Number(parsed.updatedAt) || Date.now(),
        };
      } else {
        this.meta = null;
      }
    } catch (error) {
      appLogger.error('Unable to load vault meta', { error });
      throw new VaultError('VAULT_CORRUPT', 'Unable to load vault metadata');
    }
  }

  private persistMeta(): void {
    const { vaultRoot, metaPath } = this.requirePaths();
    if (!this.meta) {
      return;
    }
    try {
      writeFileInside(vaultRoot, metaPath, `${JSON.stringify(this.meta, null, 2)}\n`);
    } catch (error) {
      appLogger.error('Unable to persist vault meta', { error });
      throw new VaultError('VAULT_IO_FAILED', 'Unable to persist vault metadata');
    }
  }

  private loadIndex(): void {
    const { vaultRoot, indexPath } = this.requirePaths();
    if (!existsInside(vaultRoot, indexPath)) {
      this.persistIndex();
      return;
    }
    try {
      const raw = readFileInsideUtf8(vaultRoot, indexPath);
      const parsed = JSON.parse(raw) as VaultIndexFile;
      this.entries.clear();
      for (const entry of parsed.entries ?? []) {
        if (entry?.id && entry?.key) {
          this.entries.set(entry.id, {
            id: entry.id,
            key: entry.key,
            createdAt: Number(entry.createdAt) || Date.now(),
            updatedAt: Number(entry.updatedAt) || Date.now(),
          });
        }
      }
    } catch (error) {
      appLogger.error('Unable to load vault index, reinitializing empty index', { error });
      this.entries.clear();
      this.persistIndex();
    }
  }

  private persistIndex(): void {
    const { vaultRoot, indexPath } = this.requirePaths();
    const payload: VaultIndexFile = {
      entries: [...this.entries.values()].sort((a, b) => a.key.localeCompare(b.key)),
    };
    try {
      writeFileInside(vaultRoot, indexPath, `${JSON.stringify(payload, null, 2)}\n`);
    } catch (error) {
      appLogger.error('Unable to persist vault index', { error });
      throw new VaultError('VAULT_IO_FAILED', 'Unable to persist vault index');
    }
  }

  private blobPath(id: string): string {
    const { blobsDir } = this.requirePaths();
    return resolvePathInside(blobsDir, `${id}.bin`);
  }

  private writeBlob(id: string, secret: VaultSecret): void {
    const { vaultRoot } = this.requirePaths();
    const dek = this.requireDek();
    try {
      const plaintext = Buffer.from(JSON.stringify(secret === undefined ? null : secret), 'utf8');
      const encrypted = encryptAesGcm(plaintext, dek);
      writeFileInside(vaultRoot, this.blobPath(id), encrypted);
    } catch (error) {
      if (error instanceof VaultError) {
        throw error;
      }
      appLogger.error('Unable to write vault blob', { id, error });
      throw new VaultError('VAULT_IO_FAILED', 'Unable to write vault secret');
    }
  }

  private readBlob(id: string): VaultSecret {
    const { vaultRoot } = this.requirePaths();
    const dek = this.requireDek();
    const blobFile = this.blobPath(id);
    if (!existsInside(vaultRoot, blobFile)) {
      throw new VaultError('VAULT_CORRUPT', `Vault secret blob missing for entry ${id}`);
    }
    try {
      const encrypted = readFileInside(vaultRoot, blobFile);
      const plaintext = decryptAesGcm(encrypted, dek);
      return JSON.parse(plaintext.toString('utf8')) as VaultSecret;
    } catch (error) {
      if (error instanceof VaultError) {
        throw error;
      }
      appLogger.error('Unable to read vault blob', { id, error });
      throw new VaultError('VAULT_CORRUPT', 'Unable to decrypt vault secret');
    }
  }

  private deleteBlob(id: string): void {
    const { vaultRoot } = this.requirePaths();
    const blobFile = this.blobPath(id);
    if (existsInside(vaultRoot, blobFile)) {
      try {
        unlinkInside(vaultRoot, blobFile);
      } catch (error) {
        appLogger.error('Unable to delete vault blob', { id, error });
        throw new VaultError('VAULT_IO_FAILED', 'Unable to delete vault secret');
      }
    }
  }
}

function createKdfParams(): KdfParams {
  return {
    algo: 'scrypt',
    salt: randomBytes(16).toString('base64'),
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  };
}

function deriveKey(secret: string, kdf: KdfParams): Buffer {
  const salt = Buffer.from(kdf.salt, 'base64');
  return scryptSync(secret, salt, KEY_LENGTH, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
  });
}

function wrapKey(dek: Buffer, kek: Buffer): string {
  return encryptAesGcm(dek, kek).toString('base64');
}

function unwrapKey(wrappedDek: string, kek: Buffer): Buffer {
  return decryptAesGcm(Buffer.from(wrappedDek, 'base64'), kek);
}

function encryptAesGcm(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

function decryptAesGcm(payload: Buffer, key: Buffer): Buffer {
  if (payload.length < IV_LENGTH + 16) {
    throw new Error('Invalid ciphertext');
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = payload.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function generateRecoveryCode(): string {
  const raw = randomBytes(8).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function normalizeSecretKey(key: string): string {
  const normalized = key?.trim();
  if (!normalized) {
    throw new VaultError('VAULT_IO_FAILED', 'Vault secret key is required');
  }
  return normalized;
}

export const appVault = new AppVault();
