var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ui.router', 'ngSanitize', 'ngWebSocket']);

Cleep
.controller('cleepController', ['$scope', '$rootScope', '$state', 'toolbarTaskService', 'modalService',
                                '$timeout', '$transitions', 'settingsService', 'devicesService',
                                'updateService', 'installService', 'monitoringService', 'downloadService',
                                'electronService',
function($scope, $rootScope, $state, toolbarTask, modalService, $timeout, $transitions, settings,
        devicesService, updateService, installService, monitoringService, downloadService, electron) {
    var self = this;
    self.toolbarTask = toolbarTask;
    self.selectedToolbarItem = null;
    self.toolbarCollapsed = true;
    self._vaultUnlockDialog = null;
    self._unsubscribers = [];
    self.vaultStatus = {
        enabled: false,
        unlocked: false,
        recoveryCodesRemaining: 0,
    };

    self.refreshVaultStatus = function(status) {
        self.vaultStatus = status || {
            enabled: false,
            unlocked: false,
            recoveryCodesRemaining: 0,
        };
    };

    self.loadVaultStatus = function() {
        return electron.vault.getStatus()
            .then(function(status) {
                self.refreshVaultStatus(status);
            })
            .catch(angular.noop);
    };

    self.vaultStatusIcon = function() {
        if (!self.vaultStatus.enabled) {
            return 'safe';
        }
        return self.vaultStatus.unlocked ? 'lock-open-variant' : 'lock';
    };

    self.vaultStatusIconClass = function() {
        if (self.vaultStatus.enabled && !self.vaultStatus.unlocked) {
            return 'md-accent';
        }
        return 'white-icon';
    };

    self.vaultStatusLabel = function() {
        if (!self.vaultStatus.enabled) {
            return 'Vault disabled';
        }
        return self.vaultStatus.unlocked ? 'Vault unlocked' : 'Vault locked';
    };

    self.vaultStatusTitle = function() {
        return self.vaultStatusLabel();
    };

    self.openVaultUnlockDialog = function() {
        // One dialog at a time. Re-sent prompts while open are ignored; when the
        // dialog closes we clear main-process unlockPromptOpen so a later
        // ensureUnlocked can show the dialog again (avoids a silent deadlock).
        if (self._vaultUnlockDialog) {
            return;
        }
        self._vaultUnlockDialog = self.openModal(
            'vaultUnlockController',
            'js/vault/vault-unlock-dialog.html'
        );
        if (!self._vaultUnlockDialog || typeof self._vaultUnlockDialog.finally !== 'function') {
            self._vaultUnlockDialog = null;
            return;
        }
        self._vaultUnlockDialog
            .catch(angular.noop)
            .finally(function() {
                self._vaultUnlockDialog = null;
                if (electron.vault.notifyUnlockDialogClosed) {
                    electron.vault.notifyUnlockDialogClosed().catch(angular.noop);
                }
                self.loadVaultStatus();
            });
    };

    self.onVaultToolbarClick = function() {
        if (!self.vaultStatus.enabled) {
            self.openModal('preferencesController', 'js/preferences/preferences-dialog.html', {
                tab: 'vault',
            });
            return;
        }
        if (self.vaultStatus.unlocked) {
            self.openModal('preferencesController', 'js/preferences/preferences-dialog.html', {
                tab: 'vault',
            });
            return;
        }
        self.openVaultUnlockDialog();
    };

    self.$onInit = function() {
        // init services (idempotent - safe if called again)
        downloadService.init();
        monitoringService.init();
        updateService.init();
        installService.init();
        devicesService.init();
        self.loadVaultStatus();

        self._unsubscribers.push(
            electron.app.onOpenPage(function(_event, data) {
                const { page, ...params } = data;
                self.openPage(page, params);
            }),
            electron.app.onAuthError(function(_event, data) {
                const foundDevice = devicesService.getSelectedDevice() || devicesService.findDevice(null, data.ip);

                // Auth was enabled while this device page was already open: keep the
                // current session and ask for credentials only after the user leaves.
                if (foundDevice && devicesService.shouldDeferAuthPrompt(foundDevice.uuid)) {
                    return;
                }

                if (foundDevice) {
                    const params = {
                        url: foundDevice.url,
                        hostname: foundDevice.hostname,
                        deviceUuid: foundDevice.uuid,
                        errorCode: data.errorCode || 'UNKNOWN_ERROR',
                    };
                    $state.go('deviceAuth', params);
                } else {
                    $state.go('deviceError', { hostname: data.ip });
                }
            }),
            electron.app.onOpenModal(function(_event, args) {
                self.openModal(args.controller, args.template, args.data);
            }),
            electron.vault.onUnlockRequired(function() {
                self.openVaultUnlockDialog();
            }),
            electron.vault.onStatusChanged(function(_event, status) {
                self.refreshVaultStatus(status);
            }),
        );

        // first run? open application help
        settings.get('cleep.firstrun')
            .then((firstRun) => {
                if (!firstRun) return;
                $timeout(() => {
                    self.openModal('helpDialogController', 'js/help/help-dialog.html');
                }, 500);
                settings.set('cleep.firstrun', false);
            });
    };

    $scope.$on('$destroy', function() {
        self._unsubscribers.forEach(function(unsubscribe) {
            unsubscribe();
        });
        self._unsubscribers = [];
        downloadService.destroy();
        monitoringService.destroy();
        updateService.destroy();
        installService.destroy();
        devicesService.destroy();
    });

    // open page
    self.openPage = function(page, params) {
        devicesService.selectDevice(null);
        $state.go(page, params || {});
    };

    $rootScope.$on('open-page', (_event, data) => {
        const { page, ...params } = data;
        self.openPage(page, params);
    });

    $rootScope.$on('open-preferences', (_event, data) => {
        self.openModal('preferencesController', 'js/preferences/preferences-dialog.html', data || {});
    });

    // open modal (returns $mdDialog promise)
    self.openModal = function(controllerName, templateUrl, data) {
        return modalService.open(controllerName, templateUrl, data || {});
    };

    // toolbar
    $transitions.onEnter({}, (_trans, state) => {
        self.selectedToolbarItem = state.name;
        toolbarTask.clearForPage(state.name);
    });

    self.toggleToolbar = function() {
        self.toolbarCollapsed = !self.toolbarCollapsed;
    };

    self.onToolbarTaskClick = function() {
        toolbarTask.activate();
    };

    // application restart (from Updates page / menu)
    $rootScope.$on('restartrequired', () => {
        updateService.restartRequired = true;
        toolbarTask.set('update', {
            page: 'updates',
            label: 'Restart needed',
            title: 'Please restart CleepDesktop to apply updates',
            status: 'action',
            percent: 100,
        });
    });

    $rootScope.$on('restart', function(_event, _data) {
        self.restartApplication();
    });

    self.restartApplication = function() {
        electron.updater.quitAndInstall();
    };
}]);
