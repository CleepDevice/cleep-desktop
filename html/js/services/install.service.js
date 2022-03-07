angular
.module('Cleep')
.service('installService', ['$rootScope', '$state', 'loggerService', 'cleepService', 'tasksPanelService', '$timeout', 'settingsService', 'electronService',
function($rootScope, $state, logger, cleepService, tasksPanelService, $timeout, settingsService, electron) {

    var self = this;
    self.settings = {
        isolocal: false,
        isoraspios: false,
    };
    self.installing = false;
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
    // self.taskInstallPanelClosed = false;
    // self.taskInstallPanel = null;

    self.init = function() {
        self.getIsoSettings();
        $rootScope.$on('configchanged', self.getIsoSettings);
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
        var installData = {
            url: self.installService.installConfig.iso.url,
            drive: self.installService.installConfig.drive.device,
            wifi: self.installService.installConfig.wifi
        };
        electron.send('iso-start-install', installData);
    };

    self.onCloseInstallTaskPanel = function() {
        self.taskInstallPanel = null;
        self.taskInstallPanelClosed = true;
    };

    self.goToInstallAuto = function() {
        $state.go('installAuto');
    };

    self.fillArray = function(source, data) {
        while (source.length) source.pop();
        Object.assign(source, data);
    }
}]);
