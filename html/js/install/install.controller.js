angular
.module('Cleep')
.controller('installController', ['$rootScope', '$scope', 'toastService', 'confirmService', 'loggerService', 'updateService', 
                                'installService', 'modalService', 'downloadService',
function($rootScope, $scope, toast, confirm, logger, updateService, installService, modalService, downloadService) {
    var self = this;
    self.installService = installService;
    self.updateService = updateService;
    self.networkOptions = [
        { value: 0, label: 'Wired connection' },
        { value: 1, label: 'Wifi on available network' },
        { value: 2, label: 'Wifi on hidden network' },
    ];
    self.installProgressTitle = 'No installation running';

    self.$onInit = function() {
        installService.getIsoSettings();
    };

    self.onNetworkTypeChange = function() {
        if (installService.installConfig.network === 0) {
            installService.installConfig.wifi = null;
        }
    };

    self.refreshInstallProgressTitle = function() {
        var progress = installService.installProgress || {};
        if (progress.error && progress.error.length > 0) {
            self.installProgressTitle = 'Installation failed';
            return;
        }
        if (progress.step === 'idle' && !installService.installing && !progress.terminated) {
            self.installProgressTitle = 'No installation running';
        } else if (progress.step === 'idle' && installService.installing) {
            self.installProgressTitle = 'Preparing installation...';
        } else if (progress.step === 'idle' && !installService.installing && progress.terminated) {
            self.installProgressTitle = 'Installation completed. Insert SD card on your raspberry and power it up.';
        } else if (progress.step === 'canceled') {
            self.installProgressTitle = 'Installation canceled.';
        } else if (progress.step === 'downloading') {
            self.installProgressTitle = 'Step 1/4: downloading files';
        } else if (progress.step === 'privileges') {
            self.installProgressTitle = 'Step 2/4: requesting permissions to write on drive';
        } else if (progress.step === 'flashing') {
            self.installProgressTitle = 'Step 3/4: flashing drive';
        } else if (progress.step === 'validating') {
            self.installProgressTitle = 'Step 4/4: validating operation';
        }
    };

    $scope.$watch(function() {
        return [
            installService.installing,
            installService.installProgress && installService.installProgress.step,
            installService.installProgress && installService.installProgress.error,
            installService.installProgress && installService.installProgress.terminated,
        ].join('|');
    }, function() {
        self.refreshInstallProgressTitle();
    });

    self.gotoManualInstall = function() {
        $rootScope.$broadcast('open-page', { page: 'installManually' });
    };

    self.openIsoDialog = function() {
        modalService.open('isoDialogController', 'js/install/iso-dialog.html')
            .then((iso) => {
                logger.debug('Selected iso', iso);
                installService.installConfig.iso = iso;
                if (iso.category !== 'cleepos') {
                    installService.installConfig.wifi = null;
                    installService.installConfig.network = 0;
                }
            })
            .catch(() => { /* handle rejection */ });
    };

    self.openDriveDialog = function() {
        modalService.open('driveController', 'js/install/drive-dialog.html')
            .then(function(drive) {
                logger.debug('Selected drive', drive);
                installService.installConfig.drive = drive;
            })
            .catch(() => { /* handle rejection */ });
    };

    self.openWifiDialog = function() {
        modalService.open('wifiController', 'js/install/wifi-dialog.html', {
            network: installService.installConfig.network,
        })
            .then(function(wifi) {
                logger.debug('Selected wifi', wifi);
                installService.installConfig.wifi = wifi;
            })
            .catch(() => { /* handle rejection */ });
    };

    self.startInstall = function() {
        if (!installService.installConfig.iso || !installService.installConfig.drive) {
            toast.error('Please select a Cleep version and a drive');
            return;
        }
        if (
            installService.installConfig.iso.category === 'cleepos' &&
            installService.installConfig.network !== 0 &&
            !installService.installConfig.wifi
        ) {
            toast.error('Please configure wifi');
            return;
        }
        if (!updateService.softwareVersions.flashTool && !installService.flashToolInstalled) {
            toast.error('Flash tool is not installed yet. Please wait for updates to finish.');
            return;
        }

        logger.debug('Installation config', installService.installConfig);
        
        confirm.open('Confirm installation?', 'Installation will erase all drive content. This operation cannot be reversed!<br/> \
                      Please note that admin permissions will be requested after file download.', 'Yes, install', 'No')
            .then(() => {
                installService.startInstall();
            })
            .catch((error) => { logger.debug('CANCELED', {error}); /* handle rejection */ });
    };

    self.cancelInstall = function() {
        installService.cancelInstall();
    };

    self.downloadIso = function() {
        if (!installService.installConfig.iso.url) {
            return;
        }

        downloadService.downloadUrl(installService.installConfig.iso.url);
    };

    self.openRaspberryPiImager = function() {
        window.open('https://www.raspberrypi.com/software/', '_blank');
    };
}]);
