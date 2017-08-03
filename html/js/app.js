var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ngRoute']);

/**
 * Timestamp to human readable string
 **/
Cleep.filter('hrDatetime', function($filter) {
    return function(ts, shortYear) {
        if( angular.isUndefined(ts) || ts===null )
            return '-';
        else
        {
            if( angular.isUndefined(shortYear) )
                return moment.unix(ts).format('DD/MM/YYYY HH:mm:ss');
            else
                return moment.unix(ts).format('DD/MM/YY HH:mm:ss');
        }
    };
});

Cleep.filter('hrTime', function($filter) {
    return function(ts, withSeconds) {
        if( angular.isUndefined(ts) || ts===null )
            return '-';
        else
        {
            if( angular.isUndefined(withSeconds) )
                return moment.unix(ts).format('HH:mm:ss');
            else
                return moment.unix(ts).format('HH:mm');
        }
    };
});

Cleep.filter('hrDate', function($filter) {
    return function(ts, shortYear) {
        if( angular.isUndefined(ts) || ts===null )
            return '-';
        else
        {
            if( angular.isUndefined(shortYear) )
                return moment.unix(ts).format('DD/MM/YYYY');
            else
                return moment.unix(ts).format('DD/MM/YY');
        }
    };
});

/**
 * Theme configuration
 */
Cleep.config(['$mdThemingProvider', function($mdThemingProvider) {
    $mdThemingProvider
        .theme('default')
        .primaryPalette('blue-grey')
        .accentPalette('red')
        .backgroundPalette('grey');
    $mdThemingProvider
        .theme('dark')
        .primaryPalette('amber')
        .accentPalette('blue')
        .dark();
}]);

/**
 * Empty controller
 */
var emptyController = function($rootScope, $scope)
{
    var self = this;
};
Cleep.controller('emptyController', ['$rootScope', '$scope', emptyController]);

/**
 * Devices controller
 */
var devicesController = function($rootScope, $scope)
{
    var self = this;

    //scan devices
    self.refresh = function()
    {
    };
};
Cleep.controller('devicesController', ['$rootScope', '$scope', devicesController]);

/**
 * Homepage controller
 */
var homepageController = function($rootScope, $scope, uiService)
{
    var self = this;

    self.refresh = function()
    {
        console.log('refresh button clicked');
        uiService.sendUi('coucou', null);
    };


};
Cleep.controller('homepageController', ['$rootScope', '$scope', 'uiService', homepageController]);

/**
 * Preferences controller
 */
var preferencesController = function($rootScope, $scope, uiService)
{
    var self = this;

    self.pref = 'general';
    self.noproxy = false;
    self.manualproxy = false;
    /*self.proxyMode = null;
    self.proxyIp = null;
    self.proxyPort = null;*/

    //get configuration
    self.getConfig = function()
    {
        uiService.getConfig()
            .then(function(config) {
                console.log(config);
                /*self.proxyMode = config.proxymode;
                self.proxyIp = config.proxyip;
                self.proxyPort = config.proxyport;*/
                self.config = config;

                //update proxy mode
                self.updateProxyMode(self.config.proxymode);
            });
    };

    //update proxy mode
    self.updateProxyMode = function(mode)
    {
        if( mode==='noproxy' )
        {
            self.noproxy = true;
            self.manualproxy = false;
        }
        else if( mode==='manualproxy' )
        {
            self.noproxy = false;
            self.manualproxy = true;
        }
        self.config.proxymode = mode;
    };

    //go back
    self.back = function()
    {
        uiService.back();
    }

    //init controller
    self.getConfig();
};
Cleep.controller('preferencesController', ['$rootScope', '$scope', 'uiService', preferencesController]);

/**
 * Easy install controller
 */
var easyInstallController = function($rootScope, $scope, uiService, $timeout, toast, confirm)
{
    var self = this;
    self.status = {
        percent: 0,
        total_percent: 0,
        status: 0,
        eta: ''
    };
    self.drives = [];
    self.selectedDrive = null;
    self.isos = [];
    self.selectedIso = null;

    self.test = function() {
        toast.info("coucou");
    };

    /**
     * Return current flash status
     */
    self.getStatus = function(init)
    {
        return uiService.sendCommand('getflashstatus')
            .then(function(resp) {
                self.status = resp.data;

                //launch watcher if process is running
                if( init===true && self.status.status!=0 )
                {
                    self.watchStatus();
                }
            });
    };

    /**
     * Get flashable drives
     */
    self.refreshDrives = function()
    {
        return uiService.sendCommand('getflashdrives')
            .then(function(resp) {
                self.drives = resp.data;
            });
    };

    /**
     * Get isos
     */
    self.refreshIsos = function()
    {
        return uiService.sendCommand('getisos')
            .then(function(resp) {
                self.isos = resp.data;
            });
    };

    /**
     * Get status every 1 seconds
     */
    self.watchStatus = function()
    {
        $timeout(function() {
            self.getStatus();
        }, 1000)
            .then(function() {
                //launch again getstatus until end of flash process
                if( self.status.status<5 )
                {
                    self.watchStatus();
                }
            });
    };

    /**
     * Start flash process
     */
    self.startFlash = function()
    {     
        //check values
        if( !self.selectedIso || !self.selectedDrive )
        {
            toast.error('Please select a Cleep version and a drive');
            return;
        }
        
        confirm.open('Confirm installation?', 'Installation will erase all drive content. This operation cannot be reversed!', 'Yes, install Cleep', 'No')
            .then(function() {
                var data = {
                    uri: self.selectedIso,
                    drive: self.selectedDrive
                };
                uiService.sendCommand('startflash', data)
                    .then(function() {
                        toast.info('Installation started')
                        self.watchStatus();
                    });
            });
    };

    /**
     * Cancel flash process
     */
    self.cancelFlash = function()
    {
        //check if process is running
        if( self.status && self.status.status>=5 )
        {
            return;
        }

        if( self.status && (self.status.status===1 || self.status.status===2) )
        {
            confirm.open('Cancel installation?', null, 'Yes', 'No')
                .then(function() {
                    uiService.sendCommand('cancelflash')
                        .then(function() {
                            toast.info('Installation canceled');
                        });
                });
        }
        else if( self.status && (self.status.status===3 || self.status.status===4) )
        {
            confirm.open('Cancel installation?', 'Canceling installation during this step of process makes your removable media unusable until next installation.', 'Yes, I want to cancel', 'No, I don\'t want')
                .then(function() {
                    uiService.sendCommand('cancelflash')
                        .then(function() {
                            toast.info('Installation canceled');
                        });
                });
        }
    };

    //init controller
    self.getStatus(true);
};
Cleep.controller('easyInstallController', ['$rootScope', '$scope', 'uiService', '$timeout', 'toastService', 'confirmService', easyInstallController]);


