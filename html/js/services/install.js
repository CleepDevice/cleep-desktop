/**
 * Install service handles data useful to install module
 */
angular
.module('Cleep')
.service('installService', ['$rootScope', '$state', 'loggerService', 'cleepService', 'tasksPanelService', 'toastService', '$timeout',
function($rootScope, $state, logger, cleepService, tasksPanelService, toast, $timeout) {
    var self = this;
    self.installing = false;
    self.STATUS = {
        IDLE: 0,
        DOWNLOADING: 1,
        DOWNLOADING_NOSIZE: 2,
        FLASHING: 3,
        VALIDATING: 4,
        REQUEST_WRITE_PERMISSIONS: 5,
        DONE: 6,
        CANCELED: 7,
        ERROR: 8,
        ERROR_INVALIDSIZE: 9,
        ERROR_BADCHECKSUM: 10,
        ERROR_FLASH: 11,
        ERROR_NETWORK: 12,
    };
    self.status = {
        percent: 0,
        total_percent: 0,
        status: 0,
        eta: ''
    };
    self.isos = {
        isos: [],
        cleepisos: 0,
        raspiosisos: 0,
        withraspiosisos: false,
        withlocalisos: false
    };
    self.drives = [];
    self.wifi = {
        networks: [],
        adapter: false
    }
    // save install config in service for data persistence
    self.installConfig = {
        drive: null,
        iso: null,
        wifiChoice: 0,
        wifi: null
    };
    self.taskInstallPanelClosed = false;
    self.taskInstallPanel = null;

    self.init = function() {
        // refresh only adapter at startup
        $timeout(self.refreshWifiAdapter, 2000);
    };

    self.getStatus = function() {
        return cleepService.sendCommand('get_status', 'install')
            .then(function(resp) {
                self.status = resp.data;
            });
    };

    self.refreshWifiAdapter = function() {
        return cleepService.sendCommand('get_wifi_adapter', 'install')
            .then(function(resp) {
                self.wifi.adapter = resp.data.adapter;
            });
    };

    self.refreshWifiNetworks = function() {
        return cleepService.sendCommand('get_wifi_networks', 'install')
            .then(function(resp) {
                self.wifi.networks = resp.data.networks;
            });
    };

    self.refreshDrives = function() {
        return cleepService.sendCommand('get_flashable_drives', 'install')
            .then(function(resp) {
                // clear existing drives
                self.drives.splice(0, self.drives.length);

                // fill with new values
                for( var i=0; i<resp.data.length; i++) {
                    self.drives.push(resp.data[i]);
                }
            });
    };

    self.refreshIsos = function() {
        return cleepService.sendCommand('get_isos', 'install')
            .then(function(resp) {
                self.isos.isos = resp.data.isos;
                self.isos.cleepisos = resp.data.cleepisos;
                self.isos.raspiosisos = resp.data.raspiosisos;
                self.isos.withraspiosisos = resp.data.withraspiosisos;
                self.isos.withlocalisos = resp.data.withlocalisos;
            });
    };

    /**
     * Start install
     * @data: install data (drive, iso, wifi...)
     */
    self.startInstall = function(data) {
        self.installing = true;
        return cleepService.sendCommand('start_install', 'install', data);
    };

    self.cancelInstall = function() {
        return cleepService.sendCommand('cancel_install', 'install')
            .then(function() {
                self.installing = false;
                toast.info('Installation canceled');
            });
    };

    $rootScope.$on('configchanged', function(_config) {
        logger.debug('Configuration changed, refresh install service values');
        self.init();
    });

    self.onCloseInstallTaskPanel = function() {
        self.taskInstallPanel = null;
        self.taskInstallPanelClosed = true;
    };

    self.jumpToInstallAuto = function() {
        $state.go('installAuto');
    };

    // install update received
    $rootScope.$on('install', function(_event, data) {
        if( !data ) {
            return;
        }

        // save status
        self.status = data;

        // detect install process
        if (self.status.status === self.STATUS.IDLE || self.status.status >= self.STATUS.DONE) {
            self.installing = false;
        } else {
            self.installing = true;

            if (!self.taskInstallPanel && !self.taskInstallPanelClosed) {
                self.taskInstallPanel = tasksPanelService.addItem(
                    'Installing Cleep on drive...',
                    {
                        onAction: self.jumpToInstallAuto,
                        tooltip: 'Go to install page',
                        icon: 'sd'
                    },
                    {
                        onClose: self.onCloseInstallTaskPanel,
                        disabled: false
                    },
                    true
                );
            }
        }
        logger.debug('Status=' + self.status.status + ' installing=' + self.installing, self.status);

        // detect end of install
        if (self.installing === false) {
            logger.info('Install is terminated. Restore ui');

            // force percent to 100%
            self.status.percent = 100;
            self.status.total_percent = 100;

            tasksPanelService.removeItem(self.taskInstallPanel);
            self.taskInstallPanel = null;
            self.taskInstallPanelClosed = false;

            $rootScope.$broadcast('enablequit');
        }
    });

}]);
