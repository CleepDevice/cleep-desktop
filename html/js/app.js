var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ngRoute']);

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

    self.pref = 'proxy';
    self.proxyMode = null;
    self.proxyIp = null;
    self.proxyPort = null;

    self.init = function()
    {
        self.getConfig();
    };

    //get configuration
    self.getConfig = function()
    {
        uiService.getConfig()
            .then(function(config) {
                console.log(config);
                self.proxyMode = config.proxymode;
                self.proxyIp = config.proxyip;
                self.proxyPort = config.proxyport;
            });
    };

    //go back
    self.back = function()
    {
        uiService.back();
    }

    self.init();
};
Cleep.controller('preferencesController', ['$rootScope', '$scope', 'uiService', preferencesController]);

/**
 * Easy install controller
 */
var easyInstallController = function($rootScope, $scope, uiService, $timeout, toast)
{
    var self = this;
    self.status = {
        percent: 0,
        status: 0
    };
    self.drives = [];
    self.selectedDrive = null;
    self.versions = [];
    self.selectedVersion = null;

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
     * Get cleep versions
     */
    self.refreshVersions = function()
    {
        return uiService.sendCommand('getcleepversions')
            .then(function(resp) {
                self.versions = resp.data;
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
                if( self.status.status<4 )
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
        var data = {
            uri: 'https://downloads.raspberrypi.org/raspbian_lite_latest',
            drive: 'toto'
        };
        uiService.sendCommand('startflash', data)
            .then(function() {
                toast.info('Flashing started')
                self.watchStatus();
            });
    };

    /**
     * Cancel flash process
     */
    self.cancelFlash = function()
    {
        uiService.sendCommand('stopflash')
            .then(function() {
                toast.info('Flashing canceled');
            });
    };

    //init controller
    self.getStatus(true);
};
Cleep.controller('easyInstallController', ['$rootScope', '$scope', 'uiService', '$timeout', 'toastService', easyInstallController]);


