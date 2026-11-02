/**
 * Content-area tabs: permanent main tab (Desktop page or one device) + up to 3
 * secondary device tabs. Max 4 tabs total. One webview session per open device.
 */
angular
.module('Cleep')
.service('contentTabsService', ['$rootScope', '$state', 'devicesService', 'loggerService',
function($rootScope, $state, devicesService, logger) {
    var self = this;

    self.MAX_TABS = 4;
    self.MAIN_ID = 'main';

    /** @type {{ id: string, title: string, icon: string, iconImg?: string, closable: boolean, kind: 'page'|'device', deviceUuid?: string }[]} */
    self.tabs = [];
    self.activeTabId = self.MAIN_ID;

    /**
     * Live device webview sessions (main device + secondaries).
     * @type {{ deviceUuid: string, hostname: string, url: string, viaGateway: boolean, loading: boolean, error: boolean, icon: string }[]}
     */
    self.sessions = [];

    /** Global header loader - last loading session / page wins. */
    self.loading = false;

    var PAGE_META = {
        default: { title: 'Welcome to CleepDesktop', icon: 'home', iconImg: 'images/cleep-3d.png' },
        help: { title: 'Application help', icon: 'help-circle' },
        about: { title: 'About CleepDesktop', icon: 'information' },
        support: { title: 'Get support', icon: 'lifebuoy' },
        updates: { title: 'Updates', icon: 'update' },
        installAuto: { title: 'Cleep installation', icon: 'sd' },
        installManually: { title: 'Manual Cleep installation', icon: 'sd' },
        monitoring: { title: 'Messages received from devices', icon: 'message-text' },
        developerSync: { title: 'Developer sync activity', icon: 'text-box-outline' },
        deviceAuth: { title: 'Device sign-in', icon: 'cellphone-key' },
        deviceError: { title: 'Connection failed', icon: 'alert-circle' },
        device: { title: 'Device', icon: 'cellphone' },
        devPlayground: { title: 'Dev playground', icon: 'flask' },
    };

    self._mainPage = {
        kind: 'page',
        state: 'default',
        title: PAGE_META.default.title,
        icon: PAGE_META.default.icon,
        iconImg: PAGE_META.default.iconImg,
        deviceUuid: null,
    };

    self._rebuildTabs = function() {
        var mainTab = {
            id: self.MAIN_ID,
            closable: false,
            kind: self._mainPage.kind,
            title: self._mainPage.title,
            icon: self._mainPage.icon,
            iconImg: self._mainPage.iconImg,
            deviceUuid: self._mainPage.deviceUuid || null,
        };
        var secondary = self.sessions
            .filter(function(session) {
                return self._mainPage.kind !== 'device' || session.deviceUuid !== self._mainPage.deviceUuid;
            })
            .map(function(session) {
                return {
                    id: 'device-' + session.deviceUuid,
                    closable: true,
                    kind: 'device',
                    title: session.hostname || 'Device',
                    icon: session.icon || 'cellphone',
                    iconImg: null,
                    deviceUuid: session.deviceUuid,
                };
            });
        self.tabs = [mainTab].concat(secondary);
    };

    self._refreshLoading = function() {
        var activeSession = self.getActiveSession();
        if (activeSession) {
            self.loading = Boolean(activeSession.loading);
            return;
        }
        self.loading = false;
    };

    self._deviceIcon = function(device) {
        return devicesService.getDeviceIcon(device);
    };

    self.getSession = function(deviceUuid) {
        if (!deviceUuid) {
            return null;
        }
        for (var i = 0; i < self.sessions.length; i++) {
            if (self.sessions[i].deviceUuid === deviceUuid) {
                return self.sessions[i];
            }
        }
        return null;
    };

    self.getActiveSession = function() {
        var tab = self.getActiveTab();
        if (!tab || tab.kind !== 'device' || !tab.deviceUuid) {
            return null;
        }
        return self.getSession(tab.deviceUuid);
    };

    self.getActiveTab = function() {
        for (var i = 0; i < self.tabs.length; i++) {
            if (self.tabs[i].id === self.activeTabId) {
                return self.tabs[i];
            }
        }
        return self.tabs[0] || null;
    };

    self.isShowingDevice = function() {
        var tab = self.getActiveTab();
        return Boolean(tab && tab.kind === 'device');
    };

    self.canOpenNewTab = function() {
        return self.tabs.length < self.MAX_TABS;
    };

    self.findTabByDeviceUuid = function(deviceUuid) {
        if (!deviceUuid) {
            return null;
        }
        for (var i = 0; i < self.tabs.length; i++) {
            if (self.tabs[i].deviceUuid === deviceUuid) {
                return self.tabs[i];
            }
        }
        return null;
    };

    /**
     * Update main-tab chrome title while keeping the current main kind/device
     * (used for deviceAuth / deviceError overlays).
     */
    self.overlayMainTitle = function(stateName) {
        var meta = PAGE_META[stateName];
        if (!meta) {
            return;
        }
        self._mainPage.title = meta.title;
        self._mainPage.icon = meta.icon;
        self._mainPage.iconImg = meta.iconImg;
        self.activeTabId = self.MAIN_ID;
        self._rebuildTabs();
        self.loading = false;
        self._notify();
    };

    self._notify = function() {
        $rootScope.$emit('content-tabs-changed');
        $rootScope.$applyAsync();
    };

    /** Desktop page navigation → focus main, drop main device session if unused. */
    self.showPage = function(stateName, overrides) {
        var meta = PAGE_META[stateName] || { title: stateName, icon: 'file' };
        var prevMainUuid = self._mainPage.kind === 'device' ? self._mainPage.deviceUuid : null;

        self._mainPage = {
            kind: 'page',
            state: stateName,
            title: (overrides && overrides.title) || meta.title,
            icon: (overrides && overrides.icon) || meta.icon,
            iconImg: (overrides && overrides.iconImg !== undefined) ? overrides.iconImg : meta.iconImg,
            deviceUuid: null,
        };
        self.activeTabId = self.MAIN_ID;
        self._pruneOrphanSessions(prevMainUuid);
        self._rebuildTabs();
        self._refreshLoading();
        self._notify();
    };

    self._pruneOrphanSessions = function(candidateUuid) {
        if (!candidateUuid) {
            return;
        }
        var session = self.getSession(candidateUuid);
        if (!session) {
            return;
        }
        // Keep if opened as a secondary tab, or still the main tab device.
        if (session.pinnedSecondary) {
            return;
        }
        if (self._mainPage.kind === 'device' && self._mainPage.deviceUuid === candidateUuid) {
            return;
        }
        self._removeSession(candidateUuid);
    };

    self._removeSession = function(deviceUuid) {
        self.sessions = self.sessions.filter(function(session) {
            return session.deviceUuid !== deviceUuid;
        });
        $rootScope.$emit('content-tabs-session-removed', deviceUuid);
    };

    self._ensureSession = function(device, url, viaGateway, pinnedSecondary) {
        var existing = self.getSession(device.uuid);
        if (existing) {
            existing.hostname = device.hostname || existing.hostname;
            existing.url = url || existing.url;
            existing.viaGateway = Boolean(viaGateway);
            existing.icon = self._deviceIcon(device);
            if (pinnedSecondary) {
                existing.pinnedSecondary = true;
            }
            return existing;
        }
        if (self.sessions.length >= self.MAX_TABS) {
            return null;
        }
        var session = {
            deviceUuid: device.uuid,
            hostname: device.hostname || 'Device',
            url: url,
            viaGateway: Boolean(viaGateway),
            loading: true,
            error: false,
            icon: self._deviceIcon(device),
            pinnedSecondary: Boolean(pinnedSecondary),
        };
        self.sessions.push(session);
        $rootScope.$emit('content-tabs-session-added', session);
        return session;
    };

    /**
     * Open or focus a device.
     * @param {object} device
     * @param {string} url
     * @param {{ newTab?: boolean, viaGateway?: boolean }} options
     */
    self.openDevice = function(device, url, options) {
        options = options || {};
        if (!device || !device.uuid || !url) {
            return false;
        }

        var existingTab = self.findTabByDeviceUuid(device.uuid);
        if (existingTab) {
            self.activateTab(existingTab.id);
            devicesService.selectDevice(device.uuid);
            return true;
        }

        var newTab = Boolean(options.newTab);
        if (newTab && !self.canOpenNewTab()) {
            logger.info('Cannot open new device tab: max tabs reached');
            return false;
        }

        var viaGateway = Boolean(options.viaGateway);
        var session = self._ensureSession(device, url, viaGateway, newTab);
        if (!session) {
            return false;
        }

        if (newTab) {
            session.pinnedSecondary = true;
            self._rebuildTabs();
            self.activateTab('device-' + device.uuid);
        } else {
            var prevMainUuid = self._mainPage.kind === 'device' ? self._mainPage.deviceUuid : null;
            // Keep the underlying ui-router page state so switching back to a
            // page main-tab (or away from secondary device tabs) does not reload it.
            var underlyingState = self._mainPage.kind === 'page'
                ? self._mainPage.state
                : (self._mainPage.underlyingState || self._mainPage.state || 'default');
            if (underlyingState === 'device' || underlyingState === 'deviceAuth' || underlyingState === 'deviceError') {
                underlyingState = 'default';
            }
            self._mainPage = {
                kind: 'device',
                state: underlyingState,
                underlyingState: underlyingState,
                title: device.hostname || 'Device',
                icon: self._deviceIcon(device),
                iconImg: null,
                deviceUuid: device.uuid,
            };
            self.activeTabId = self.MAIN_ID;
            if (prevMainUuid && prevMainUuid !== device.uuid) {
                self._pruneOrphanSessions(prevMainUuid);
            }
            self._rebuildTabs();
            devicesService.selectDevice(device.uuid);
            self._refreshLoading();
            self._notify();
        }
        // Never $state.go('device') here: tab switches only toggle webview/ui-view
        // visibility. Navigating would destroy the main page and reload it on return.
        return true;
    };

    self.activateTab = function(tabId) {
        if (!tabId) {
            return;
        }
        var found = null;
        for (var i = 0; i < self.tabs.length; i++) {
            if (self.tabs[i].id === tabId) {
                found = self.tabs[i];
                break;
            }
        }
        if (!found) {
            return;
        }
        self.activeTabId = tabId;
        if (found.kind === 'device' && found.deviceUuid) {
            devicesService.selectDevice(found.deviceUuid);
            // Webview pool is toggled via activeTabId - do not touch ui-router.
        } else if (found.kind === 'page' && self._mainPage.state) {
            devicesService.selectDevice(null);
            // Restore page only if ui-view is stuck on a device placeholder state.
            var name = $state.current && $state.current.name;
            if (
                (name === 'device' || name === 'deviceAuth' || name === 'deviceError')
                && self._mainPage.state
                && self._mainPage.state !== name
            ) {
                $state.go(self._mainPage.state);
            }
        }
        self._refreshLoading();
        self._notify();
    };

    self.closeTab = function(tabId) {
        if (!tabId || tabId === self.MAIN_ID) {
            return;
        }
        var tab = null;
        for (var i = 0; i < self.tabs.length; i++) {
            if (self.tabs[i].id === tabId) {
                tab = self.tabs[i];
                break;
            }
        }
        if (!tab || !tab.closable || !tab.deviceUuid) {
            return;
        }
        var wasActive = self.activeTabId === tabId;
        var uuid = tab.deviceUuid;
        var session = self.getSession(uuid);
        if (session) {
            session.pinnedSecondary = false;
        }
        // Remove session unless it is the main tab device.
        if (!(self._mainPage.kind === 'device' && self._mainPage.deviceUuid === uuid)) {
            self._removeSession(uuid);
        }
        self._rebuildTabs();
        if (wasActive) {
            self.activateTab(self.MAIN_ID);
        } else {
            self._refreshLoading();
            self._notify();
        }
    };

    self.setSessionLoading = function(deviceUuid, loading) {
        var session = self.getSession(deviceUuid);
        if (!session) {
            return;
        }
        session.loading = Boolean(loading);
        if (loading) {
            session.error = false;
        }
        self._refreshLoading();
        self._notify();
    };

    self.setSessionError = function(deviceUuid, isError) {
        var session = self.getSession(deviceUuid);
        if (!session) {
            return;
        }
        session.error = Boolean(isError);
        session.loading = false;
        self._refreshLoading();
        self._notify();
        if (isError) {
            var tab = self.findTabByDeviceUuid(deviceUuid);
            if (tab && self.activeTabId === tab.id) {
                $state.go('deviceError', {
                    hostname: session.hostname,
                    url: session.url,
                    deviceUuid: deviceUuid,
                });
            }
        }
    };

    self.reloadSession = function(deviceUuid) {
        var session = self.getSession(deviceUuid);
        if (!session) {
            return;
        }
        session.error = false;
        session.loading = true;
        self._refreshLoading();
        $rootScope.$emit('content-tabs-reload-session', deviceUuid);
        self._notify();
    };

    self.updateDeviceIcons = function() {
        self.sessions.forEach(function(session) {
            var device = devicesService.findDevice(session.deviceUuid);
            if (device) {
                session.icon = self._deviceIcon(device);
                session.hostname = device.hostname || session.hostname;
            }
        });
        if (self._mainPage.kind === 'device' && self._mainPage.deviceUuid) {
            var mainDevice = devicesService.findDevice(self._mainPage.deviceUuid);
            if (mainDevice) {
                self._mainPage.icon = self._deviceIcon(mainDevice);
                self._mainPage.title = mainDevice.hostname || self._mainPage.title;
            }
        }
        self._rebuildTabs();
        self._notify();
    };

    // Init
    self._rebuildTabs();
}]);
