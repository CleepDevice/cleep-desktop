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
 * Loader controller
 */
var loaderController = function($rootScope, $scope, $timeout)
{
    var self = this;
    self.show = false;

    $timeout(function() {
        self.show = true;
    }, 500);
};
Cleep.controller('loaderController', ['$rootScope', '$scope', '$timeout', loaderController]);

/**
 * Devices controller
 */
var devicesController = function($rootScope, $scope, rpcService, $timeout)
{
    var self = this;
    self.devices = [];
    self.unconfigured = 0;
    self.configured = 0;
    self.loading = true;

    //synchronize devices
    self.syncDevices = function(devices)
    {
        if( devices )
        {
            var found = false;
            for( var i=0; i<devices.length; i++ )
            {
                found = false;
                for( var j=0; j<self.devices.length; j++ )
                {
                    if( self.devices[j].uuid===devices[i].uuid )
                    {
                        //device found
                        found = true;

                        //update device infos
                        self.devices[j].hostname = devices[i].hostname;
                        self.devices[j].ip = devices[i].ip;
                        self.devices[j].port = devices[i].port;
                        self.devices[j].online = devices[i].online;

                        break;
                    }
                }

                //add new device
                if( !found )
                {
                    //set device configured flag
                    if( devices[i].hostname.length>0 )
                        devices[i].configured = true;
                    else
                        devices[i].configured = false;

                    //save entry
                    self.devices.push(devices[i]);
                }
            }
        }
    };

    //get devices
    self.getDevices = function()
    {
        rpcService.getDevices('coucou', null)
            .then(function(resp) {
                if( resp && !resp.error )
                {
                    self.loading = false;

                    self.syncDevices(resp.data.devices);
                    self.unconfigured = resp.data.unconfigured;
                    self.configured = self.devices.length - self.unconfigured;
                }
            });
    };

    //watch for devices
    self.watchDevices = function()
    {
        $timeout(function() {
            self.getDevices();
        }, 1000)
            .then(function() {
                self.watchDevices();
            });
    };

    //open device page
    self.openDevicePage = function(device)
    {
        if( device )
        {
            rpcService.sendCommand('openDevicePage', {
                uuid: device.uuid,
                ip: device.ip,
                port: device.port,
                ssl: device.ssl
            });
        }
    };

    //init controller
    self.watchDevices();
};
Cleep.controller('devicesController', ['$rootScope', '$scope', 'rpcService', '$timeout', devicesController]);

/**
 * Homepage controller
 */
var homepageController = function($rootScope, $scope, rpcService)
{
    var self = this;

    self.refresh = function()
    {
        console.log('refresh button clicked');
        rpcService.sendUi('coucou', null);
    };
};
Cleep.controller('homepageController', ['$rootScope', '$scope', 'rpcService', homepageController]);

/**
 * About controller
 */
var aboutController = function($rootScope, $scope, rpcService)
{
    var self = this;
    self.version = '';

    self.getVersion = function()
    {
        rpcService.sendCommand('version', null)
            .then(function(resp) {
                self.version = resp.data.version;
            });
    };

    //init controller
    self.getVersion();
};
Cleep.controller('aboutController', ['$rootScope', '$scope', 'rpcService', aboutController]);

/**
 * Preferences controller
 */
var preferencesController = function($rootScope, $scope, rpcService, debounce)
{
    var self = this;

    self.pref = 'general';
    self.config = {};
    self.noproxy = false;
    self.manualproxy = false;

    //automatic settings saving when config value changed
    $scope.$watchCollection(function() {
        return self.config;
    }, function(newValue, oldValue) {
        if( Object.keys(newValue).length>0 && Object.keys(oldValue).length>0 )
        {
            debounce.exec('config', self.setConfig, 500)
                .then(function() {
                    console.log('config saved');
                }, function() {})
        }
    });

    //get configuration
    self.getConfig = function()
    {
        rpcService.getConfig()
            .then(function(resp) {
                //save config
                self.config = resp.data.config;

                //update proxy mode
                self.updateProxyMode(self.config.proxymode);
            });
    };

    //set configuration
    self.setConfig = function()
    {
        rpcService.setConfig(self.config)
            .then(function(resp) {
                //overwrite config if specified
                if( resp && resp.data && resp.data.config )
                {
                    self.config = resp.data.config;
                }
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
        rpcService.back();
    }

    //init controller
    self.getConfig();
};
Cleep.controller('preferencesController', ['$rootScope', '$scope', 'rpcService', 'debounceService', preferencesController]);

/**
 * Easy install controller
 */
var easyInstallController = function($rootScope, $scope, rpcService, $timeout, toast, confirm, $filter)
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
    self.noCleepIso = true;
    self.noRaspbianIso = true;
    self.noDrive = true;

    self.test = function() {
        toast.info("coucou");
    };

    /**
     * Return current flash status
     */
    self.getStatus = function(init)
    {
        return rpcService.sendCommand('getflashstatus')
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
        return rpcService.sendCommand('getflashdrives')
            .then(function(resp) {
                self.drives = resp.data;
                self.noDrive = self.drives.length===0;
            });
    };

    /**
     * Get isos
     */
    self.refreshIsos = function()
    {
        return rpcService.sendCommand('getisos')
            .then(function(resp) {
                self.isos = resp.data.isos;
                self.noCleepIso = resp.data.cleepIsos===0;
                self.noRaspbianIso = resp.data.raspbianIsos===0;
                self.raspbian = resp.data.raspbian;
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
                rpcService.sendCommand('startflash', data)
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
                    rpcService.sendCommand('cancelflash')
                        .then(function() {
                            toast.info('Installation canceled');
                        });
                });
        }
        else if( self.status && (self.status.status===3 || self.status.status===4) )
        {
            confirm.open('Cancel installation?', 'Canceling installation during this step of process makes your removable media unusable until next installation.', 'Yes, I want to cancel', 'No, I don\'t want')
                .then(function() {
                    rpcService.sendCommand('cancelflash')
                        .then(function() {
                            toast.info('Installation canceled');
                        });
                });
        }
    };

    //init controller
    self.getStatus(true);
};
Cleep.controller('easyInstallController', ['$rootScope', '$scope', 'rpcService', '$timeout', 'toastService', 'confirmService', '$filter', easyInstallController]);


