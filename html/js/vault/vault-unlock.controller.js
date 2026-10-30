angular
.module('Cleep')
.controller('vaultUnlockController', ['$scope', 'toastService', 'electronService', 'closeModal',
function($scope, toast, electron, closeModal) {
    var self = this;
    self.panel = 'unlock';
    self.busy = false;
    self.completed = false;
    self.passphrase = '';
    self.recoveryCode = '';
    self.nextPassphrase = '';
    self.passphraseConfirm = '';
    self.recoveryCodesText = '';

    $scope.$on('$destroy', function() {
        if (!self.completed) {
            electron.vault.dismissUnlock().catch(function() {
                // ignore - main may already have resolved/rejected waiters
            });
        }
    });

    self.readPassphrase = function() {
        // Prefer live DOM value: browser autofill often fills the input without
        // updating Angular ng-model (so ctl.passphrase stays stale/empty/wrong).
        var input = document.querySelector('md-dialog input[name="vault-passphrase"]')
            || document.querySelector('md-dialog input[type="password"]');
        var fromDom = input && typeof input.value === 'string' ? input.value : '';
        return (fromDom || self.passphrase || '').trim();
    };

    self.onPassphraseKeydown = function($event) {
        if ($event && $event.keyCode === 13) {
            $event.preventDefault();
            self.unlock();
        }
    };

    self.cancel = function() {
        closeModal();
    };

    self.finish = function() {
        self.completed = true;
        closeModal(true);
    };

    self.unlock = function() {
        var passphrase = self.readPassphrase();
        if (!passphrase) {
            toast.warning('Please enter the vault passphrase');
            return;
        }
        self.busy = true;
        electron.vault.unlock(passphrase)
            .then(function() {
                self.completed = true;
                toast.success('Vault unlocked');
                closeModal(true);
            })
            .catch(function(error) {
                toast.warning((error && error.message) || 'Unable to unlock vault');
            })
            .finally(function() {
                self.busy = false;
            });
    };

    self.recover = function() {
        if (!self.recoveryCode) {
            toast.warning('Please enter a recovery code');
            return;
        }
        if (!self.nextPassphrase || self.nextPassphrase.length < 8) {
            toast.warning('Passphrase must be at least 8 characters');
            return;
        }
        if (self.nextPassphrase !== self.passphraseConfirm) {
            toast.warning('Passphrase confirmation does not match');
            return;
        }

        self.busy = true;
        electron.vault.recover(self.recoveryCode, self.nextPassphrase)
            .then(function(result) {
                self.completed = true;
                self.recoveryCodesText = (result.recoveryCodes || []).join('\n');
                self.panel = 'codes';
                toast.success('Vault recovered');
            })
            .catch(function(error) {
                toast.warning((error && error.message) || 'Unable to recover vault');
            })
            .finally(function() {
                self.busy = false;
            });
    };

    self.copyRecoveryCodes = function() {
        var text = self.recoveryCodesText;
        if (!text) {
            return;
        }
        var copyPromise = navigator.clipboard && navigator.clipboard.writeText
            ? navigator.clipboard.writeText(text)
            : Promise.reject(new Error('clipboard unavailable'));
        copyPromise
            .then(function() {
                toast.success('Recovery codes copied');
            })
            .catch(function() {
                toast.warning('Unable to copy recovery codes');
            });
    };
}]);
