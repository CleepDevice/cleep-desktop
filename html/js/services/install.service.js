/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.service('installService', ['$state', 'loggerService', 'tasksPanelService', 'settingsService', 'electronService', 'toastService',
function($state, logger, tasksPanelService, settingsService, electron, toast) {
    var self = this;
    self.settings = {
        isolocal: false,
        isoraspios: false,
    };
    self.installing = false;
    self.installProgress = {
        percent: 0,
        eta: 0,
        step: 'idle',
        terminated: false,
        error: '',
    };
    self.installConfig = {
        iso: null,
        drive: null,
        network: 0,
        wifi: null,
    };
    self.wifiInfo = {
        retrieved: false,
        hasWifi: true,
        networks: []
    }
    self.isosInfo = {
        retrieved: false,
        raspios: {},
        cleepos: {},
    }
    self.drives = [];
    self.taskInstallPanelId = null;
    self.flashToolInstalled = false;

    self._ipcReady = false;
    self._unsubscribers = [];

    self.init = function() {
        if (self._ipcReady) {
            return;
        }
        self.addIpcs();
        self._ipcReady = true;
        self.getIsoSettings();
    };

    self.destroy = function() {
        self._unsubscribers.forEach(function(unsubscribe) {
            unsubscribe();
        });
        self._unsubscribers = [];
        self._ipcReady = false;
    };

    self.addIpcs = function() {
        self._unsubscribers.push(
            electron.on('iso-install-progress', self.onHandleInstallProgress.bind(self)),
        );
    };

    self.onHandleInstallProgress = function(_event, installProgress) {
        Object.assign(self.installProgress, installProgress);
        if(self.installProgress.terminated || self.installProgress.error || self.installProgress.step === 'canceled') {
            self.installing = false;
        } else {
            self.installing = true;
        }

        if (!self.installing) {
            self.terminateInstall();
        }
    };

    self.terminateInstall = function() {
        if (self.installProgress.error.length === 0 && self.installProgress.step !== 'canceled') {
            // install terminated without error, reset only drive field that
            // must be scanned again if user installs another device
            self.installConfig.drive = null;
        }
        self.onCloseInstallTaskPanel();
    }

    self.getIsoSettings = function() {
        return settingsService.getSelected(['cleep.isolocal', 'cleep.isoraspios'])
            .then((settings) => {
                if (settings['cleep.isoraspios'] !== self.settings.isoraspios) {
                    self.isosInfo.retrieved = false;
                }
                self.settings.isolocal = settings['cleep.isolocal'];
                self.settings.isoraspios = settings['cleep.isoraspios'];
            });
    };

    self.hasWifi = function() {
        return electron.sendReturn('iso-has-wifi')
            .then((hasWifi) => {
                self.wifiInfo.hasWifi = hasWifi;
                return self.wifiInfo.hasWifi;
            })
            .catch(() => {
                self.wifiInfo.hasWifi = false;
                return false;
            });
    }

    self.refreshWifiNetworks = function(force = false) {
        if ((self.wifiInfo.retrieved && !force) || !self.wifiInfo.hasWifi) {
            return Promise.resolve();
        }

        return electron.sendReturn('iso-refresh-wifi-networks')
            .then((networks) => {
                self.wifiInfo.retrieved = true;
                self.fillArray(self.wifiInfo.networks, networks);
            })
            .catch(() => {
                toast.error('Unable to refresh wifi networks');
            });
    };

    self.refreshIsosInfo = function(force = false) {
        if (self.isosInfo.retrieved && !force) {
            return Promise.resolve();
        }

        return electron.sendReturn('iso-get-isos', Boolean(force))
            .then((data) => {
                self.isosInfo.retrieved = true;
                self.isosInfo.raspios = data.raspios || {};
                self.isosInfo.cleepos = data.cleepos || {};
            })
            .catch(() => {
                toast.error('Unable to get files');
            });
    };

    self.refreshDriveList = function() {
        return electron.sendReturn('iso-get-drives')
            .then((result) => {
                self.flashToolInstalled = result.flashToolInstalled;
                self.fillArray(self.drives, result.drives);
            })
            .catch(() => {
                toast.error('Unable to get drives');
            });
    };

    self.startInstall = function() {
        self.installing = true;
        self.installProgress.error = '';
        self.installProgress.terminated = false;
        self.installProgress.step = 'idle';
        self.installProgress.percent = 0;
        if (!self.taskInstallPanelId) {
            self.taskInstallPanelId = tasksPanelService.addPanel(
                'Installing device...', 
                {
                    onAction: self.goToInstallAuto,
                    tooltip: 'Open install page',
                    icon: 'open-in-app'
                },
                {
                    onClose: self.onCloseInstallTaskPanel,
                    disabled: false
                },
                true
            );
        }

        var useWifi = self.installConfig.iso.category === 'cleepos' && self.installConfig.network !== 0;
        var installData = {
            isoUrl: self.installConfig.iso.url,
            isoSha256: self.installConfig.iso.sha256,
            isoFilename: self.installConfig.iso.filename,
            drivePath: self.installConfig.drive.device,
            wifiData: useWifi ? self.installConfig.wifi : null,
        };
        logger.debug('Install data', installData);
        electron.send('iso-start-install', installData);
    };

    self.cancelInstall = function() {
        if (!self.installing) return;
        electron.send('iso-cancel-install');
    };

    self.onCloseInstallTaskPanel = function() {
        if (!self.taskInstallPanelId) return;
        tasksPanelService.removePanel(self.taskInstallPanelId);
        self.taskInstallPanelId = null;
    };

    self.goToInstallAuto = function() {
        $state.go('installAuto');
    };

    self.fillArray = function(source, data) {
        while (source.length) source.pop();
        Object.assign(source, data);
    }
}]);
