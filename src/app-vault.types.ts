/**
 * Application vault — encrypted secret store for CleepDesktop (not an end-user password manager).
 */

export type VaultSecret = unknown;

export type VaultStatus = {
  /** Vault feature explicitly enabled by the user. Default false. */
  enabled: boolean;
  /** True when the data-encryption key is loaded in memory for this session. */
  unlocked: boolean;
  /** Number of unused recovery codes still stored. */
  recoveryCodesRemaining: number;
};

export type VaultEnableResult = {
  status: VaultStatus;
  /** Shown once at enable / regenerate — never persisted in cleartext. */
  recoveryCodes: string[];
};

export type VaultErrorCode =
  | 'VAULT_NOT_CONFIGURED'
  | 'VAULT_DISABLED'
  | 'VAULT_LOCKED'
  | 'VAULT_ALREADY_ENABLED'
  | 'VAULT_INVALID_PASSPHRASE'
  | 'VAULT_INVALID_RECOVERY_CODE'
  | 'VAULT_WEAK_PASSPHRASE'
  | 'VAULT_ENTRY_NOT_FOUND'
  | 'VAULT_CORRUPT'
  | 'VAULT_IO_FAILED';

export class VaultError extends Error {
  public readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}
