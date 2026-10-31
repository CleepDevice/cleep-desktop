angular
.module('Cleep')
.service('installService', ['$state', 'loggerService', 'toolbarTaskService', 'settingsService', 'electronService', 'toastService', 'ipcLifecycle',
function($state, logger, toolbarTask, settingsService, electron, toast, ipcLifecycle) {
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
        networks: [],
        currentSsid: '',
    };
    self.isosInfo = {
        retrieved: false,
        raspios: {},
        cleepos: {},
    };
    self.drives = [];
    self.flashToolInstalled = false;

    self.addIpcs = function() {
        self._unsubscribers.push(
            electron.install.onProgress(self.onHandleInstallProgress.bind(self)),
        );
    };

    ipcLifecycle.attach(self, self.addIpcs, function() {
        self.getIsoSettings();
    });

    self.installTaskLabel = function(progress) {
        var step = (progress && progress.step) || 'idle';
        if (step === 'downloading') {
            return 'Download SD';
        }
        if (step === 'privileges') {
            return 'Install SD';
        }
        if (step === 'flashing') {
            return 'Flash SD';
        }
        if (step === 'validating') {
            return 'Validate SD';
        }
        return 'Install SD';
    };

    self.syncInstallToolbarTask = function() {
        var progress = self.installProgress;
        if (self.installing) {
            var stepLabel = self.installTaskLabel(progress);
            var percentLabel = Math.round(progress.percent || 0) + '%';
            toolbarTask.set('install', {
                page: 'installAuto',
                label: stepLabel + ' ' + percentLabel,
                title: stepLabel + ' ' + percentLabel,
                status: 'running',
                percent: progress.percent || 0,
            });
            return;
        }

        if (progress.step === 'canceled') {
            toolbarTask.clear('install');
            return;
        }
        if (progress.error && progress.error.length) {
            toolbarTask.set('install', {
                page: 'installAuto',
                label: 'Install failed',
                title: progress.error,
                status: 'error',
                percent: 100,
            });
            return;
        }
        if (progress.terminated) {
            toolbarTask.set('install', {
                page: 'installAuto',
                label: 'Install done',
                title: 'Installation finished - open Install for details',
                status: 'success',
                percent: 100,
            });
        }
    };

    self.onHandleInstallProgress = function(_event, installProgress) {
        Object.assign(self.installProgress, installProgress);
        if (self.installProgress.terminated || self.installProgress.error || self.installProgress.step === 'canceled') {
            self.installing = false;
        } else {
            self.installing = true;
        }

        if (!self.installing) {
            self.terminateInstall();
        } else {
            self.syncInstallToolbarTask();
        }
    };

    self.terminateInstall = function() {
        if (self.installProgress.error.length === 0 && self.installProgress.step !== 'canceled') {
            self.installConfig.drive = null;
        }
        self.syncInstallToolbarTask();
    };

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
        return electron.install.hasWifi()
            .then((hasWifi) => {
                self.wifiInfo.hasWifi = hasWifi;
                return self.wifiInfo.hasWifi;
            })
            .catch(() => {
                self.wifiInfo.hasWifi = false;
                return false;
            });
    };

    self.refreshWifiNetworks = function(force = false) {
        if ((self.wifiInfo.retrieved && !force) || !self.wifiInfo.hasWifi) {
            return Promise.resolve();
        }

        return electron.install.refreshWifiNetworks()
            .then((data) => {
                var networks = Array.isArray(data) ? data : ((data && data.networks) || []);
                var currentSsid = Array.isArray(data) ? '' : ((data && data.currentSsid) || '');
                self.fillArray(self.wifiInfo.networks, networks);
                self.wifiInfo.currentSsid = currentSsid || '';
                self.wifiInfo.retrieved = true;
            })
            .catch(() => {
                self.fillArray(self.wifiInfo.networks, []);
                self.wifiInfo.currentSsid = '';
                self.wifiInfo.retrieved = true;
                toast.error('Unable to refresh wifi networks');
            });
    };

    self.refreshIsosInfo = function(force = false) {
        if (self.isosInfo.retrieved && !force) {
            return Promise.resolve();
        }

        return electron.install.getIsos(Boolean(force))
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
        return electron.install.getDrives()
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
        self.syncInstallToolbarTask();

        var useWifi = self.installConfig.iso.category === 'cleepos' && self.installConfig.network !== 0;
        var installData = {
            isoUrl: self.installConfig.iso.url,
            isoSha256: self.installConfig.iso.sha256,
            isoFilename: self.installConfig.iso.filename,
            drivePath: self.installConfig.drive.device,
            wifiData: useWifi ? self.installConfig.wifi : null,
        };
        logger.debug('Install data', installData);
        electron.install.start(installData);
    };

    /**
     * Cancel is only safe during ISO download (or before write starts).
     * Once privileges/flashing/validating begins, aborting can brick the SD card.
     */
    self.canCancelInstall = function() {
        if (!self.installing) {
            return false;
        }
        var step = self.installProgress.step;
        return step === 'idle' || step === 'downloading';
    };

    self.cancelInstall = function() {
        if (!self.canCancelInstall()) {
            return;
        }
        electron.install.cancel();
    };

    self.goToInstallAuto = function() {
        $state.go('installAuto');
    };

    self.fillArray = function(source, data) {
        while (source.length) source.pop();
        Object.assign(source, data);
    };
}]);
