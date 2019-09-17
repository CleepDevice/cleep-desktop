/**
 * Install service handles data useful to install module
 */
var installService = function($rootScope, $state, logger, cleepService, tasksPanelService)
{
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
        raspbianisos: 0,
        withraspbianisos: false,
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

    /**
     * Return current install status
     */
    self.getStatus = function() {
        return cleepService.sendCommand('get_status', 'install')
            .then(function(resp) {
                self.status = resp.data;
            });
    };

    /**
     * Return wifi adapter infos
     */
    self.refreshWifiAdapter = function() {
        return cleepService.sendCommand('get_wifi_adapter', 'install')
            .then(function(resp) {
                self.wifi.adapter = resp.data.adapter;
            });
    };

    /**
     * Refresh available wifi networks
     */
    self.refreshWifiNetworks = function() {
        return cleepService.sendCommand('get_wifi_networks', 'install')
            .then(function(resp) {
                self.wifi.networks = resp.data.networks;
            });
    };

    /**
     * Refresh list of available drives
     */
    self.refreshDrives = function() {
        return cleepService.sendCommand('get_flashable_drives', 'install')
            .then(function(resp) {
                //clear existing drives
                self.drives.splice(0, self.drives.length);

                //fill with new values
                for( var i=0; i<resp.data.length; i++) {
                    self.drives.push(resp.data[i]);
                }
            });
    };

    /**
     * Refresh isos list
     */
    self.refreshIsos = function() {
        return cleepService.sendCommand('get_isos', 'install')
            .then(function(resp) {
                self.isos.isos = resp.data.isos;
                self.isos.cleepisos = resp.data.cleepisos;
                self.isos.raspbianisos = resp.data.raspbianisos;
                self.isos.withraspbianisos = resp.data.withraspbianisos;
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

    /**
     * Cancel install
     */
    self.cancelInstall = function() {
        return cleepService.sendCommand('cancel_install', 'install')
            .then(function() {
                self.installing = false;
                toast.info('Installation canceled');
            });
    };

    /**
     * Init service values
     */
    self.init = function() {
        //refresh only adapter at startup
        self.refreshWifiAdapter();
    };

    /**
     * Handle config changed to update internal values automatically
     */
    $rootScope.$on('configchanged', function(_config) {
        logger.debug('Configuration changed, refresh install service values');
        self.init();
    });

    // on close install task panel event
    self.onCloseInstallTaskPanel = function() {
        //reset variable
        self.taskInstallPanel = null;
        self.taskInstallPanelClosed = true;
    };

    // jump to auto install page
    self.jumpToInstallAuto = function() {
        $state.go('installAuto');
    };

    // install update received
    $rootScope.$on('install', function(_event, data) {
        if( !data ) {
            return;
        }

        //save status
        self.status = data;

        //detect install process
        if( self.status.status===self.STATUS.IDLE || self.status.status>=self.STATUS.DONE ) {
            self.installing = false;

        } else {
            self.installing = true;

            if(!self.taskInstallPanel && !self.taskInstallPanelClosed) {
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

        //end of install
        if( self.installing===false ) {
            logger.info('Install is terminated. Restore ui');

            //close taskpanel
            tasksPanelService.removeItem(self.taskInstallPanel);
            self.taskInstallPanel = null;
            self.taskInstallPanelClosed = false;

            //suppress warning dialog
            $rootScope.$broadcast('enablequit');
        }
    });

};

var Cleep = angular.module('Cleep');
Cleep.service('installService', ['$rootScope', '$state', 'logger', 'cleepService', 'tasksPanelService', installService]);
