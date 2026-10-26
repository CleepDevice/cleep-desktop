angular
.module('Cleep')
.controller('preferencesController', ['$scope', 'debounceService', 'toastService', 'settingsService', 'electronService', 'confirmService', 'closeModal',
function($scope, debounce, toast, settingsService, electron, confirm, closeModal) {
    var self = this;
    self.pref = 'general';
    self.settings = {};
    self.cacheDir = '';
    self.cachedFiles = [];
    self.networkInterfaces = [];
    self.selectedNetworkInterface = '';
    self.networkConfig = {};
    self.networkApplying = false;
    self.networkPollTimer = null;
    self.vaultStatus = {
        enabled: false,
        unlocked: false,
        recoveryCodesRemaining: 0,
    };
    self.vaultPanel = 'main';
    self.vaultBusy = false;
    self.vaultRecoveryCodes = [];
    self.vaultRecoveryCodesText = '';
    self.vaultCopyingCodes = false;
    self.vaultForm = {
        passphrase: '',
        passphraseConfirm: '',
        nextPassphrase: '',
        recoveryCode: '',
    };

    self.closeModal = closeModal;

    self.$onInit = function() {
        self.getSettings();
        self.getCacheInfos();
    };

    self.loadNetworkConfig = function() {
        return electron.bus.getNetworkConfig()
            .then((config) => {
                self.networkConfig = config;
                self.networkInterfaces = config.interfaces || [];
                self.selectedNetworkInterface = config.selectedInterface || '';
            })
            .catch(() => {
                toast.warning('Network settings are unavailable. Restart CleepDesktop (main process update required).');
                self.networkConfig = { busConnected: false, peerCount: 0, interfaces: [] };
                self.networkInterfaces = [];
            });
    };

    self.applyNetworkInterface = function() {
        self.networkApplying = true;
        electron.bus.setNetworkInterface(self.selectedNetworkInterface)
            .then((config) => {
                self.networkConfig = config;
                self.networkInterfaces = config.interfaces || [];
                self.selectedNetworkInterface = config.selectedInterface || '';
                if (self.settings.cleep) {
                    self.settings.cleep.networkinterface = self.selectedNetworkInterface;
                }
                self.startNetworkPeerPoll();
            })
            .catch(() => {
                toast.warning('Unable to change network interface');
            })
            .finally(() => {
                self.networkApplying = false;
            });
    };

    self.startNetworkPeerPoll = function() {
        if (self.networkPollTimer) {
            clearInterval(self.networkPollTimer);
        }
        var ticks = 0;
        self.networkPollTimer = setInterval(function() {
            ticks += 1;
            electron.bus.getNetworkConfig()
                .then((config) => {
                    self.networkConfig.peerCount = config.peerCount;
                    self.networkConfig.busConnected = config.busConnected;
                });
            if (ticks >= 15) {
                clearInterval(self.networkPollTimer);
                self.networkPollTimer = null;
            }
        }, 2000);
    };

    $scope.$on('$destroy', function() {
        if (self.networkPollTimer) {
            clearInterval(self.networkPollTimer);
        }
    });

    self.getSettings = function() {
        settingsService.getAll()
            .then((settings) => {
                Object.assign(this.settings, settings);
            });
    }

    self.getCacheInfos = function() {
        electron.cache.getInfos()
            .then((data) => {
                self.fillArray(self.cachedFiles, data.files);
                self.cacheDir = data.dir;
            })
            .catch(() => {
                toast.warning('Unable to load cache infos');
            });
    };

    $scope.$watch(function() {
        return self.settings;
    }, function(newValue, oldValue) {
        if (Object.keys(newValue).length > 0 && Object.keys(oldValue).length > 0) {
            debounce.exec('config', self.saveSettings, 500);
        }
    }, true);

    self.saveSettings = function() {
        electron.settings.setAll(self.settings)
            .then(() => {
                self.getSettings();
            })
            .catch(() => {
                toast.warning('Invalid settings, please check it');
            });
    };

    self.openElectronLogs = function() {
        electron.logger.openLogs();
    };

    self.deleteCachedFile = function(filename) {
        electron.cache.deleteFile(filename)
            .then(() => {
                self.getCacheInfos();
            });
    };

    self.purgeCachedFiles = function() {
        electron.cache.purgeFiles()
            .then(() => {
                self.getCacheInfos();
            });
    };

    self.resetVaultForm = function() {
        self.vaultForm = {
            passphrase: '',
            passphraseConfirm: '',
            nextPassphrase: '',
            recoveryCode: '',
        };
    };

    self.applyVaultStatus = function(status) {
        self.vaultStatus = status || {
            enabled: false,
            unlocked: false,
            recoveryCodesRemaining: 0,
        };
    };

    self.showRecoveryCodes = function(codes) {
        self.vaultRecoveryCodes = codes || [];
        self.vaultRecoveryCodesText = self.vaultRecoveryCodes.join('\n');
    };

    self.dismissRecoveryCodes = function() {
        self.vaultRecoveryCodes = [];
        self.vaultRecoveryCodesText = '';
    };

    self.copyRecoveryCodes = function() {
        var text = self.vaultRecoveryCodesText || self.vaultRecoveryCodes.join('\n');
        if (!text) {
            return;
        }

        self.vaultCopyingCodes = true;
        var copyPromise;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            copyPromise = navigator.clipboard.writeText(text);
        } else {
            copyPromise = new Promise(function(resolve, reject) {
                var area = document.createElement('textarea');
                area.value = text;
                area.setAttribute('readonly', '');
                area.style.position = 'fixed';
                area.style.left = '-9999px';
                document.body.appendChild(area);
                area.select();
                try {
                    if (!document.execCommand('copy')) {
                        reject(new Error('copy failed'));
                        return;
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                } finally {
                    document.body.removeChild(area);
                }
            });
        }

        copyPromise
            .then(function() {
                toast.success('Recovery codes copied');
            })
            .catch(function() {
                toast.warning('Unable to copy recovery codes');
            })
            .finally(function() {
                self.vaultCopyingCodes = false;
            });
    };

    self.loadVault = function() {
        return electron.vault.getStatus()
            .then((status) => {
                self.applyVaultStatus(status);
                self.vaultPanel = 'main';
                self.resetVaultForm();
            })
            .catch((error) => {
                var message = (error && error.message) || 'Unable to load vault status';
                if (typeof message === 'string' && message.indexOf('No handler registered') !== -1) {
                    message = 'Vault backend is outdated. Fully restart CleepDesktop.';
                }
                toast.warning(message);
                self.applyVaultStatus({ enabled: false, unlocked: false, recoveryCodesRemaining: 0 });
            });
    };

    self.assertPassphrasePair = function(passphrase, confirm) {
        if (!passphrase || passphrase.length < 8) {
            toast.warning('Passphrase must be at least 8 characters');
            return false;
        }
        if (passphrase !== confirm) {
            toast.warning('Passphrase confirmation does not match');
            return false;
        }
        return true;
    };

    self.enableVault = function() {
        if (!self.assertPassphrasePair(self.vaultForm.passphrase, self.vaultForm.passphraseConfirm)) {
            return;
        }
        self.vaultBusy = true;
        electron.vault.enable(self.vaultForm.passphrase)
            .then((result) => {
                self.applyVaultStatus(result.status);
                self.showRecoveryCodes(result.recoveryCodes);
                self.resetVaultForm();
                self.vaultPanel = 'main';
                toast.success('Vault enabled');
            })
            .catch((error) => {
                toast.warning(self.vaultErrorMessage(error, 'Unable to enable vault'));
            })
            .finally(() => {
                self.vaultBusy = false;
            });
    };

    self.vaultErrorMessage = function(error, fallback) {
        var message = (error && error.message) || fallback;
        if (typeof message === 'string' && message.indexOf('No handler registered') !== -1) {
            return 'Vault backend is outdated. Fully restart CleepDesktop.';
        }
        return message;
    };

    self.unlockVault = function() {
        if (!self.vaultForm.passphrase) {
            toast.warning('Please enter the vault passphrase');
            return;
        }
        self.vaultBusy = true;
        electron.vault.unlock(self.vaultForm.passphrase)
            .then((status) => {
                self.applyVaultStatus(status);
                self.resetVaultForm();
                toast.success('Vault unlocked');
            })
            .catch((error) => {
                toast.warning(self.vaultErrorMessage(error, 'Unable to unlock vault'));
            })
            .finally(() => {
                self.vaultBusy = false;
            });
    };

    self.lockVault = function() {
        self.vaultBusy = true;
        electron.vault.lock()
            .then((status) => {
                self.applyVaultStatus(status);
                toast.info('Vault locked');
            })
            .catch((error) => {
                toast.warning(self.vaultErrorMessage(error, 'Unable to lock vault'));
            })
            .finally(() => {
                self.vaultBusy = false;
            });
    };

    self.changeVaultPassphrase = function() {
        if (!self.vaultForm.passphrase) {
            toast.warning('Please enter the current passphrase');
            return;
        }
        if (!self.assertPassphrasePair(self.vaultForm.nextPassphrase, self.vaultForm.passphraseConfirm)) {
            return;
        }
        self.vaultBusy = true;
        electron.vault.changePassphrase(self.vaultForm.passphrase, self.vaultForm.nextPassphrase)
            .then((status) => {
                self.applyVaultStatus(status);
                self.resetVaultForm();
                self.vaultPanel = 'main';
                toast.success('Passphrase updated');
            })
            .catch((error) => {
                toast.warning(self.vaultErrorMessage(error, 'Unable to change passphrase'));
            })
            .finally(() => {
                self.vaultBusy = false;
            });
    };

    self.disableVault = function() {
        if (!self.vaultForm.passphrase) {
            toast.warning('Please enter the vault passphrase');
            return;
        }
        confirm.open('Disable vault?', 'All application secrets stored in the vault will be permanently deleted.')
            .then(() => {
                self.vaultBusy = true;
                return electron.vault.disable(self.vaultForm.passphrase);
            })
            .then((status) => {
                self.applyVaultStatus(status);
                self.resetVaultForm();
                self.vaultPanel = 'main';
                self.dismissRecoveryCodes();
                toast.success('Vault disabled');
            })
            .catch((error) => {
                if (!error) {
                    return;
                }
                toast.warning(self.vaultErrorMessage(error, 'Unable to disable vault'));
            })
            .finally(() => {
                self.vaultBusy = false;
            });
    };

    self.recoverVault = function() {
        if (!self.vaultForm.recoveryCode) {
            toast.warning('Please enter a recovery code');
            return;
        }
        if (!self.assertPassphrasePair(self.vaultForm.nextPassphrase, self.vaultForm.passphraseConfirm)) {
            return;
        }
        self.vaultBusy = true;
        electron.vault.recover(self.vaultForm.recoveryCode, self.vaultForm.nextPassphrase)
            .then((result) => {
                self.applyVaultStatus(result.status);
                self.showRecoveryCodes(result.recoveryCodes);
                self.resetVaultForm();
                self.vaultPanel = 'main';
                toast.success('Vault recovered');
            })
            .catch((error) => {
                toast.warning(self.vaultErrorMessage(error, 'Unable to recover vault'));
            })
            .finally(() => {
                self.vaultBusy = false;
            });
    };

    self.regenerateRecoveryCodes = function() {
        if (!self.vaultForm.passphrase) {
            toast.warning('Please enter the vault passphrase');
            return;
        }
        self.vaultBusy = true;
        electron.vault.regenerateRecoveryCodes(self.vaultForm.passphrase)
            .then((result) => {
                self.applyVaultStatus(result.status);
                self.showRecoveryCodes(result.recoveryCodes);
                self.resetVaultForm();
                self.vaultPanel = 'main';
                toast.success('Recovery codes regenerated');
            })
            .catch((error) => {
                toast.warning(self.vaultErrorMessage(error, 'Unable to regenerate recovery codes'));
            })
            .finally(() => {
                self.vaultBusy = false;
            });
    };

    self.fillArray = function(source, data) {
        while (source.length) source.pop();
        Object.assign(source, data);
    };
}]);
