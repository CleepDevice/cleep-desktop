angular
.module('Cleep')
.service('installService', ['$rootScope', '$state', 'loggerService', 'tasksPanelService', 'settingsService', 'electronService',
function($rootScope, $state, logger, tasksPanelService, settingsService, electron) {

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

    self.init = function() {
        self.addIpcs();
        self.getIsoSettings();
        $rootScope.$on('configchanged', self.getIsoSettings);
    };

    self.addIpcs = function() {
        electron.on('iso-install-progress', self.onHandleInstallProgress.bind(self));
    };

    self.onHandleInstallProgress = function(_event, installProgress) {
        Object.assign(self.installProgress, installProgress);
        self.installing = !self.installProgress.terminated;

        if (!self.installing) {
            self.onCloseInstallTaskPanel();
        }
    };

    self.getIsoSettings = function() {
        settingsService.getAll(['cleep.isolocal', 'cleep.isoraspios'])
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
                return hasWifi;
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
            });
    };

    self.refreshIsosInfo = function() {
        if (self.isosInfo.retrieved) {
            return Promise.resolve();
        }

        return electron.sendReturn('iso-get-isos')
            .then((isos) => {
                self.isosInfo.retrieved = true;
                Object.assign(self.isosInfo.raspios, isos.raspios);
                Object.assign(self.isosInfo.cleepos, isos.cleepos);
            });
    };

    self.refreshDriveList = function() {
        return electron.sendReturn('iso-get-drives')
            .then((drives) => {
                self.fillArray(self.drives, drives);
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
