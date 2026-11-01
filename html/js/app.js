var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ui.router', 'ngSanitize', 'ngWebSocket']);

Cleep
.controller('cleepController', ['$scope', '$rootScope', '$state', 'toolbarTaskService', 'modalService',
                                '$timeout', '$transitions', 'settingsService', 'devicesService',
                                'updateService', 'installService', 'monitoringService', 'downloadService',
                                'electronService', 'toastService',
function($scope, $rootScope, $state, toolbarTask, modalService, $timeout, $transitions, settings,
        devicesService, updateService, installService, monitoringService, downloadService, electron, toast) {
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
    self.websiteAuthAvailable = false;
    self.websiteAuthBusy = false;
    self._websiteLoginDialog = null;
    self.websiteSession = {
        email: '',
        nickname: '',
        authenticated: false,
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

    self.refreshWebsiteAuthAvailability = function() {
        return settings.get('cleep.apiurl')
            .then(function(apiUrl) {
                self.websiteAuthAvailable = Boolean(apiUrl && String(apiUrl).trim());
            })
            .catch(function() {
                self.websiteAuthAvailable = false;
            });
    };

    self.applyWebsiteSession = function(session) {
        self.websiteSession = session || {
            email: '',
            nickname: '',
            authenticated: false,
        };
        // Older sessions may lack nickname — fall back to email for display.
        if (self.websiteSession.authenticated && !self.websiteSession.nickname) {
            self.websiteSession.nickname = self.websiteSession.email || '';
        }
    };

    self.refreshWebsiteSession = function() {
        if (!electron.website || !electron.website.getSession) {
            return Promise.resolve();
        }
        return electron.website.getSession()
            .then(function(session) {
                self.applyWebsiteSession(session);
            })
            .catch(angular.noop);
    };

    self.websiteDisplayName = function() {
        if (!self.websiteSession) {
            return '';
        }
        return self.websiteSession.nickname || self.websiteSession.email || '';
    };

    self.websiteAuthIcon = function() {
        return self.websiteSession.authenticated ? 'account-check' : 'account';
    };

    self.websiteAuthLabel = function() {
        var name = self.websiteDisplayName();
        if (self.websiteSession.authenticated && name) {
            return name;
        }
        return 'Cleep account';
    };

    self.websiteAuthTitle = function() {
        var name = self.websiteDisplayName();
        if (self.websiteSession.authenticated && name) {
            return 'Signed in as ' + name;
        }
        return 'Sign in to Cleep website';
    };

    self.openWebsiteAuthMenu = function($mdMenu, $event) {
        if (!self.websiteAuthAvailable) {
            return;
        }
        self.refreshWebsiteSession();
        $mdMenu.open($event);
    };

    /** Website origin derived from API URL (strip trailing /api). */
    self.openCleepWebsite = function() {
        settings.get('cleep.apiurl')
            .then(function(apiUrl) {
                var url = String(apiUrl || '').trim().replace(/\/+$/, '');
                if (!url) {
                    return;
                }
                if (/\/api$/i.test(url)) {
                    url = url.replace(/\/api$/i, '');
                }
                electron.shell.openUrl(url);
            })
            .catch(angular.noop);
    };

    self._showWebsiteLoginDialog = function(creds) {
        if (self._websiteLoginDialog) {
            return;
        }
        self._websiteLoginDialog = self.openModal(
            'websiteLoginController',
            'js/website-auth/website-login-dialog.html',
            {
                email: (creds && creds.email) || self.websiteSession.email || '',
                password: (creds && creds.password) || '',
                fromVault: Boolean(creds && creds.fromVault),
            }
        );
        if (!self._websiteLoginDialog || typeof self._websiteLoginDialog.finally !== 'function') {
            self._websiteLoginDialog = null;
            return;
        }
        self._websiteLoginDialog
            .then(function(session) {
                if (session) {
                    self.applyWebsiteSession(session);
                }
            })
            .catch(angular.noop)
            .finally(function() {
                self._websiteLoginDialog = null;
                self.refreshWebsiteSession();
            });
    };

    self.openWebsiteLoginDialog = function() {
        if (self._websiteLoginDialog || self.websiteAuthBusy) {
            return;
        }
        // Unseal vault first (if enabled) — stored creds can sign in without a form.
        var loadCreds = (electron.website && electron.website.loadCredentials)
            ? electron.website.loadCredentials()
            : Promise.resolve({
                email: self.websiteSession.email || '',
                password: '',
                fromVault: false,
            });

        self.websiteAuthBusy = true;
        loadCreds
            .catch(function() {
                return {
                    email: self.websiteSession.email || '',
                    password: '',
                    fromVault: false,
                };
            })
            .then(function(creds) {
                // Vault unlock may have restored a Bearer session (OS/vault fallback).
                return self.refreshWebsiteSession().then(function() {
                    if (self.websiteSession.authenticated) {
                        toast.success('Signed in');
                        return;
                    }

                    var email = (creds && creds.email) || '';
                    var password = (creds && creds.password) || '';
                    if (creds && creds.fromVault && email && password && electron.website && electron.website.login) {
                        return electron.website.login(email, password)
                            .then(function(session) {
                                self.applyWebsiteSession(session);
                                toast.success('Signed in');
                            })
                            .catch(function(error) {
                                toast.error((error && error.message) || 'Sign-in failed');
                                self._showWebsiteLoginDialog(creds);
                            });
                    }

                    self._showWebsiteLoginDialog(creds);
                });
            })
            .finally(function() {
                self.websiteAuthBusy = false;
            });
    };

    self.websiteLogout = function() {
        if (self.websiteAuthBusy || !self.websiteSession.authenticated) {
            return;
        }
        self.websiteAuthBusy = true;
        electron.website.logout()
            .then(function(session) {
                self.applyWebsiteSession(session);
                toast.info('Signed out from Cleep website.');
            })
            .catch(function() {
                toast.warning('Unable to sign out cleanly');
            })
            .finally(function() {
                self.websiteAuthBusy = false;
            });
    };

    self.$onInit = function() {
        // init services (idempotent - safe if called again)
        downloadService.init();
        monitoringService.init();
        updateService.init();
        installService.init();
        devicesService.init();
        self.loadVaultStatus();
        self.refreshWebsiteAuthAvailability();
        self.refreshWebsiteSession();

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

        if (electron.website && electron.website.onChanged) {
            self._unsubscribers.push(
                electron.website.onChanged(function(_event, session) {
                    self.applyWebsiteSession(session);
                }),
            );
        }

        $scope.$on('cleep-settings-saved', function() {
            self.refreshWebsiteAuthAvailability();
        });

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
