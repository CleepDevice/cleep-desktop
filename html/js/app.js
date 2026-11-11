var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ui.router', 'ngSanitize', 'ngWebSocket']);

Cleep
.controller('cleepController', ['$scope', '$rootScope', '$state', 'toolbarTaskService', 'modalService',
                                '$timeout', '$transitions', 'settingsService', 'devicesService',
                                'updateService', 'installService', 'monitoringService', 'developerSyncLogService',
                                'downloadService', 'firmwareService', 'electronService', 'toastService', 'contentTabsService',
function($scope, $rootScope, $state, toolbarTask, modalService, $timeout, $transitions, settings,
        devicesService, updateService, installService, monitoringService, developerSyncLog, downloadService,
        firmwareService, electron, toast, contentTabs) {
    var self = this;
    self.toolbarTask = toolbarTask;
    self.contentTabs = contentTabs;
    self.selectedToolbarItem = null;
    self.toolbarCollapsed = true;
    self._vaultUnlockDialog = null;
    self._unsubscribers = [];
    self.vaultStatus = {
        enabled: false,
        unlocked: false,
        recoveryCodesRemaining: 0,
    };
    self.developerStatus = {
        enabled: false,
        sourcesDir: '',
        sourcesOk: false,
        deviceUuid: '',
        deviceOk: false,
        hasDeveloperDevice: false,
        selectedApps: [],
        appsOk: false,
        sshConfigured: false,
        syncSupported: true,
        syncSupport: 'supported',
        syncTools: {
            probed: false,
            supported: false,
            viaWsl: false,
            hasWsl: false,
            hasRsync: false,
            hasSshpass: false,
            missing: [],
            message: '',
        },
        syncStatus: 'idle',
        syncError: '',
        lastSyncAt: null,
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

    self.refreshDeveloperStatus = function(status) {
        self.developerStatus = status || {
            enabled: false,
            sourcesDir: '',
            sourcesOk: false,
            deviceUuid: '',
            deviceOk: false,
            hasDeveloperDevice: false,
            selectedApps: [],
            appsOk: false,
            sshConfigured: false,
            syncSupported: true,
            syncSupport: 'supported',
            syncTools: {
                probed: false,
                supported: false,
                viaWsl: false,
                hasWsl: false,
                hasRsync: false,
                hasSshpass: false,
                missing: [],
                message: '',
            },
            syncStatus: 'idle',
            syncError: '',
            lastSyncAt: null,
        };
    };

    self.loadDeveloperStatus = function() {
        if (!electron.developer || !electron.developer.getStatus) {
            return Promise.resolve();
        }
        return electron.developer.getStatus()
            .then(function(status) {
                self.refreshDeveloperStatus(status);
            })
            .catch(angular.noop);
    };

    self.developerHasProblem = function() {
        var status = self.developerStatus;
        if (!status.enabled) {
            return false;
        }
        if (!status.hasDeveloperDevice || !status.deviceOk || !status.sourcesOk || !status.appsOk || !status.sshConfigured || !status.syncSupported) {
            return true;
        }
        return status.syncStatus === 'failed';
    };

    self.developerStatusIconClass = function() {
        if (self.developerStatus.enabled && self.developerStatus.syncStatus === 'syncing') {
            return 'white-icon';
        }
        if (self.developerHasProblem()) {
            return 'toolbar-developer-icon-warning';
        }
        return 'white-icon';
    };

    self.developerStatusLabel = function() {
        if (!self.developerStatus.enabled) {
            return 'Developer';
        }
        if (!self.developerStatus.syncSupported) {
            return 'Sync tools missing';
        }
        if (!self.developerStatus.hasDeveloperDevice) {
            return 'No developer device';
        }
        if (!self.developerStatus.deviceOk) {
            return 'Select device';
        }
        if (!self.developerStatus.sourcesDir) {
            return 'Sources missing';
        }
        if (!self.developerStatus.sourcesOk) {
            return 'Sources unavailable';
        }
        if (!self.developerStatus.appsOk) {
            return 'Select apps';
        }
        if (!self.developerStatus.sshConfigured) {
            return 'SSH missing';
        }
        if (self.developerStatus.syncStatus === 'syncing') {
            return 'Syncing';
        }
        if (self.developerStatus.syncStatus === 'failed') {
            return 'Sync failed';
        }
        return 'Developer';
    };

    self.developerStatusTitle = function() {
        if (!self.developerStatus.enabled) {
            return 'Developer mode';
        }
        if (!self.developerStatus.syncSupported) {
            var toolsMessage = self.developerStatus.syncTools && self.developerStatus.syncTools.message;
            return toolsMessage || 'Developer mode: rsync and sshpass are required (WSL on Windows)';
        }
        if (!self.developerStatus.hasDeveloperDevice) {
            return 'Developer mode: install cleepapp-developer on a device';
        }
        if (!self.developerStatus.deviceOk) {
            return 'Developer mode: select a development device';
        }
        if (!self.developerStatus.sourcesDir) {
            return 'Developer mode: select a sources folder';
        }
        if (!self.developerStatus.sourcesOk) {
            return 'Developer mode: sources folder unavailable';
        }
        if (!self.developerStatus.appsOk) {
            return 'Developer mode: select at least one application to synchronize';
        }
        if (!self.developerStatus.sshConfigured) {
            return 'Developer mode: configure SSH password';
        }
        if (self.developerStatus.syncStatus === 'syncing') {
            return 'Developer mode: synchronizing sources';
        }
        if (self.developerStatus.syncStatus === 'failed') {
            return 'Developer mode: ' + (self.developerStatus.syncError || 'sync failed');
        }
        return 'Developer mode';
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
        // Older sessions may lack nickname - fall back to email for display.
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
        // Unseal vault first (if enabled) - stored creds can sign in without a form.
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
        developerSyncLog.init();
        updateService.init();
        installService.init();
        devicesService.init();
        self.loadVaultStatus();
        self.loadDeveloperStatus();
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

        if (electron.developer && electron.developer.onStatusChanged) {
            self._unsubscribers.push(
                electron.developer.onStatusChanged(function(_event, status) {
                    self.refreshDeveloperStatus(status);
                }),
            );
        }

        if (electron.website && electron.website.onChanged) {
            self._unsubscribers.push(
                electron.website.onChanged(function(_event, session) {
                    self.applyWebsiteSession(session);
                }),
            );
        }

        $scope.$on('cleep-settings-saved', function() {
            self.refreshWebsiteAuthAvailability();
            self.loadDeveloperStatus();
        });

        $rootScope.$on('devices-updated', function() {
            self.loadDeveloperStatus();
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
        developerSyncLog.destroy();
        updateService.destroy();
        installService.destroy();
        devicesService.destroy();
    });

    self.showDeviceWebviews = function() {
        if (!contentTabs.isShowingDevice()) {
            return false;
        }
        var name = $state.current && $state.current.name;
        // Auth still uses the shared ui-view; connection errors stay on the
        // webview slot overlay so secondary tabs do not hijack the main tab.
        if (name === 'deviceAuth') {
            return false;
        }
        return Boolean(contentTabs.getActiveSession());
    };

    self.isActiveDeviceSession = function(session) {
        if (!session) {
            return false;
        }
        var active = contentTabs.getActiveSession();
        return Boolean(active && active.deviceUuid === session.deviceUuid);
    };

    self.retryDeviceSession = function(deviceUuid) {
        contentTabs.retrySession(deviceUuid);
    };

    self.canRefreshDeviceSession = function(deviceUuid) {
        var device = devicesService.findDevice(deviceUuid);
        return devicesService.canRefreshRemoteUrl(device);
    };

    self.refreshDeviceSessionRemoteUrl = function(deviceUuid) {
        var device = devicesService.findDevice(deviceUuid);
        if (!device || !devicesService.canRefreshRemoteUrl(device) || self._refreshingDeviceUuid) {
            return;
        }
        self._refreshingDeviceUuid = deviceUuid;
        electron.devices.refreshRemoteUrl({ deviceUuid: device.uuid })
            .then(function(result) {
                toast.success('Remote URL updated');
                var publicUrl = result && result.publicUrl;
                if (!publicUrl) {
                    return;
                }
                var tab = contentTabs.findTabByDeviceUuid(device.uuid);
                contentTabs.openDevice(device, publicUrl, {
                    newTab: Boolean(tab && tab.closable),
                    viaGateway: false,
                });
                contentTabs.retrySession(device.uuid);
            })
            .catch(function(error) {
                toast.error((error && error.message) || 'Unable to refresh remote URL');
            })
            .finally(function() {
                self._refreshingDeviceUuid = null;
            });
    };

    self.closeContentTab = function($event, tabId) {
        if ($event) {
            $event.preventDefault();
            $event.stopPropagation();
        }
        contentTabs.closeTab(tabId);
    };

    /**
     * Toolbar accent for desktop pages.
     * Device tabs keep the previous ui-router state underneath, so we must not
     * leave the last page icon highlighted while a device webview is active.
     */
    self.isToolbarItemSelected = function(page) {
        if (contentTabs.isShowingDevice()) {
            return false;
        }
        return self.selectedToolbarItem === page;
    };

    // open page
    self.openPage = function(page, params, options) {
        options = options || {};
        var result = contentTabs.showPage(page, null, options);
        if (result === 'full') {
            toast.info('Maximum number of tabs reached');
            return;
        }
        devicesService.selectDevice(null);
        // Avoid reloading the page when it is already the active ui-router state
        // (e.g. returning from a device tab that never left this state).
        if ($state.current && $state.current.name === page) {
            return;
        }
        $state.go(page, params || {});
    };

    /**
     * Middle-click a Desktop toolbar page: keep the main-tab device open as a
     * secondary tab, then open the page on the main tab.
     */
    self.onToolbarPageMouseDown = function($event, page, params) {
        if (!$event || $event.button !== 1) {
            return;
        }
        $event.preventDefault();
        $event.stopPropagation();
        self.openPage(page, params || {}, { keepMainDevice: true });
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

    // toolbar + content tab titles
    $transitions.onEnter({}, (_trans, state) => {
        self.selectedToolbarItem = state.name;
        toolbarTask.clearForPage(state.name);
        if (state.name === 'device') {
            return;
        }
        if (state.name === 'deviceAuth' || state.name === 'deviceError') {
            // Keep device sessions; only swap the header title for the overlay page.
            contentTabs.overlayMainTitle(state.name);
            return;
        }
        // Desktop pages always use the main tab.
        contentTabs.showPage(state.name);
    });

    self.toggleToolbar = function() {
        self.toolbarCollapsed = !self.toolbarCollapsed;
    };

    self.onToolbarTaskClick = function() {
        toolbarTask.activate();
    };

    // Opt-in permanent Flash Pico entry (Preferences → Developer), or when firmwares are cached
    self.flashPicoEnabled = false;
    self.showFlashPicoToolbar = function() {
        return Boolean(self.flashPicoEnabled || firmwareService.hasCached);
    };

    self.refreshFlashPicoSetting = function() {
        return settings.get('cleep.flashpico')
            .then(function(enabled) {
                self.flashPicoEnabled = Boolean(enabled);
            })
            .catch(angular.noop);
    };

    self.refreshFlashPicoSetting();

    $rootScope.$on('cleep-settings-saved', function() {
        self.refreshFlashPicoSetting();
    });

    $rootScope.$on('firmware-cache-changed', function() {
        // digest so ng-if on toolbar updates after cache changes
    });

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
