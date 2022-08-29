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
    self.noFlashTool = false;

    self.init = function() {
        self.addIpcs();
    };

    self.addIpcs = function() {
        electron.on('iso-install-progress', self.onHandleInstallProgress.bind(self));
    };

    self.onHandleInstallProgress = function(_event, installProgress) {
        Object.assign(self.installProgress, installProgress);
        self.installing = !self.installProgress.terminated;

        if (!self.installing) {
            self.terminateInstall();
        }
    };

    self.terminateInstall = function() {
        if (self.installProgress.error.length === 0) {
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
            .then((response) => {
                self.wifiInfo.hasWifi = response.data;
                return self.wifiInfo.hasWifi;
            });
    }

    self.refreshWifiNetworks = function(force = false) {
        if ((self.wifiInfo.retrieved && !force) || !self.wifiInfo.hasWifi) {
            return Promise.resolve();
        }

        return electron.sendReturn('iso-refresh-wifi-networks')
            .then((response) => {
                if (response.error) {
                    toast.error('Unable to refresh wifi networks');
                    return;
                }
                self.wifiInfo.retrieved = true;
                self.fillArray(self.wifiInfo.networks, response.data);
            });
    };

    self.refreshIsosInfo = function() {
        if (self.isosInfo.retrieved) {
            return Promise.resolve();
        }

        return electron.sendReturn('iso-get-isos')
            .then((response) => {
                if (response.error) {
                    toast.error('Unable to get files');
                    return;
                }
                self.isosInfo.retrieved = true;
                Object.assign(self.isosInfo.raspios, response.data.raspios);
                Object.assign(self.isosInfo.cleepos, response.data.cleepos);
            });
    };

    self.refreshDriveList = function() {
        return electron.sendReturn('iso-get-drives')
            .then((response) => {
                if (response.error && !response.noFlashTool) {
                    self.noFlashTool = true;
                } else if (response.error && response.noFlashTool) {
                    self.noFlashTool = false;
                    toast.error('Unable to get drives');
                    return;
                }
                self.noFlashTool = false;
                self.fillArray(self.drives, response.data);
            });
    };

    self.startInstall = function() {
        self.installing = true;
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

        var installData = {
            isoUrl: self.installConfig.iso.url,
            isoSha256: self.installConfig.iso.sha256,
            isoFilename: self.installConfig.iso.filename,
            drivePath: self.installConfig.drive.device,
            wifiData: self.installConfig.wifi,
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
