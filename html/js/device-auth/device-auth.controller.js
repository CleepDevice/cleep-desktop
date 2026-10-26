angular
.module('Cleep')
.controller('deviceAuthController', ['loggerService', 'electronService', '$stateParams', '$state', 'toastService', 'modalService',
function(logger, electron, $stateParams, $state, toast, modalService) {
    var self = this;
    logger.debug('deviceAuthController stateParams', $stateParams);

    self.hostname = $stateParams.hostname;
    self.url = $stateParams.url;
    self.deviceUuid = $stateParams.deviceUuid;
    self.errorCode = $stateParams.errorCode;
    self.account = null;
    self.password = null;
    self.saveToVault = true;
    self.vaultLoaded = false;
    self.vaultEnabled = false;
    self.busy = false;

    self.refreshVaultStatus = function() {
        return electron.vault.getStatus()
            .then((status) => {
                var wasEnabled = self.vaultEnabled;
                self.vaultEnabled = Boolean(status && status.enabled);
                self.vaultLoaded = true;
                if (!wasEnabled && self.vaultEnabled) {
                    self.saveToVault = true;
                }
                if (!self.vaultEnabled) {
                    self.saveToVault = false;
                }
            })
            .catch((error) => {
                logger.warn('Unable to load vault status on auth page', error);
                self.vaultEnabled = false;
                self.vaultLoaded = true;
                self.saveToVault = false;
            });
    };

    self.$onInit = function() {
        self.refreshVaultStatus();
    };

    self.openVaultPreferences = function($event) {
        if ($event) {
            $event.preventDefault();
        }
        modalService.open('preferencesController', 'js/preferences/preferences-dialog.html', { tab: 'vault' })
            .finally(function() {
                self.refreshVaultStatus();
            });
    };

    self.login = function() {
        if (self.busy || !self.account || !self.password) {
            return;
        }

        self.busy = true;
        const params = {
            url: self.url,
            account: self.account,
            password: self.password,
            deviceUuid: self.deviceUuid,
            saveToVault: self.vaultEnabled && self.saveToVault,
        };

        electron.devices.updateAuth(params)
            .then(() => {
                $state.go('device', {
                    url: self.url,
                    hostname: self.hostname,
                    deviceUuid: self.deviceUuid,
                    auth: true,
                });
            })
            .catch((error) => {
                logger.error('Unable to store device auth', error);
                var message = (error && error.message) || 'Unable to sign in';
                if (error && error.code === 'VAULT_UNLOCK_CANCELLED') {
                    message = 'Vault unlock cancelled — credentials were not saved';
                }
                toast.warning(message);
            })
            .finally(() => {
                self.busy = false;
            });
    };
}]);
