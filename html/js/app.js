const { remote, ipcRenderer } = require('electron');
const logger = remote.getGlobal('logger');
const appUpdater = remote.getGlobal('appUpdater');
const settings = remote.getGlobal('settings');
const appContext = remote.getGlobal('appContext');
let cleepUi = {
    openPage: null,
    openModal: null
};

//declare angular module
var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ui.router', 'ngSanitize', 'ngWebSocket']);

//inject electron values
Cleep.value('logger', logger)
    .value('appUpdater', appUpdater)
    .value('settings', settings)
    .value('appContext', appContext)
    .value('cleepUi', cleepUi);

/**
 * Timestamp to human readable string
 **/
Cleep.filter('hrDatetime', function($filter, settings) {
    return function(ts, shortYear) {
        if( angular.isUndefined(ts) || ts===null )
            return '-';
        else
        {
            //date format https://en.wikipedia.org/wiki/Date_format_by_country
            var locale = settings.get('cleep.locale');
            if( angular.isUndefined(shortYear) )
            {
                if( locale=='en' )
                    return moment.unix(ts).format('MM/DD/YYYY HH:mm:ss');
                else
                    return moment.unix(ts).format('DD/MM/YYYY HH:mm:ss');
            }
            else
            {
                if( locale=='en' )
                    return moment.unix(ts).format('MM/DD/YY HH:mm:ss');
                else
                    return moment.unix(ts).format('DD/MM/YY HH:mm:ss');
            }
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
 * Bytes to human readable
 * Code copied from https://gist.github.com/thomseddon/3511330
 */
Cleep.filter('hrBytes', function($filter) {
    return function(bytes, precision) {
        if (isNaN(parseFloat(bytes)) || !isFinite(bytes)) return '-';
        if (typeof precision === 'undefined') precision = 1;
        var units = ['bytes', 'kB', 'MB', 'GB', 'TB', 'PB'], number = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, Math.floor(number))).toFixed(precision) +  ' ' + units[number];
    }
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
        .theme('alt')
        .backgroundPalette('blue-grey')
        .dark();
}]);

/**
 * MDI font configuration
 */
Cleep.config(['$mdIconProvider', function($mdIconProvider) {
    $mdIconProvider.defaultIconSet('fonts/mdi.svg')
}]);

/**
 * Routes configuration
 */
Cleep
.config(['$stateProvider', '$urlRouterProvider', function($stateProvider, $urlRouterProvider) {
    $stateProvider
        .state('default', {
            url: '/',
            templateUrl: 'js/homepage/homepage.html'
        })
        .state('help', {
            url: '/help',
            templateUrl: 'js/help/help.html'
        })
        .state('preferences', {
            url: '/preferences',
            controller: 'preferencesController',
            controllerAs: 'ctl',
            templateUrl: 'js/preferences/preferences.html'
        })
        .state('about', {
            url: '/about',
            controller: 'aboutController',
            controllerAs: 'ctl',
            templateUrl: 'js/about/about.html'
        })
        .state('support', {
            url: '/support',
            templateUrl: 'js/support/support.html'
        })
        .state('updates', {
            url: '/updates',
            controller: 'updatesController',
            controllerAs: 'ctl',
            templateUrl: 'js/updates/updates.html'
        })
        .state('installAuto', {
            url: '/installAuto',
            controller: 'installController',
            controllerAs: 'ctl',
            templateUrl: 'js/install/installAuto.html'
        })
        .state('installManually', {
            url: '/installManually',
            controller: 'installController',
            controllerAs: 'ctl',
            templateUrl: 'js/install/installManually.html'
        })
        .state('device', {
            url: '/device',
            params: {
                url: null,
                hostname: null
            },
            controller: 'deviceController',
            controllerAs: 'ctl',
            templateUrl: 'js/device/device.html'
        })
        .state('monitoring', {
            url: '/monitoring',
            controller: 'monitoringController',
            controllerAs: 'ctl',
            templateUrl: 'js/monitoring/monitoring.html'
        });

    $urlRouterProvider.otherwise('/');
}]);

/**
 * Empty controller
 */
Cleep.controller('emptyController', [function() {
    var self = this;
}]);

/**
 * Empty dialog controller
 * Add minimal stuff to handle properly dialog
 */
Cleep.controller('emptyDialogController', ['closeModal',
function(closeModal) {
    var self = this;
    self.closeModal = closeModal;
}]);

/**
 * Cleep controller
 */
Cleep
.controller('cleepController', ['$rootScope', '$state', 'cleepService', 'tasksPanelService', 'modalService', 
'updateService', 'cleepUi', 'settings', '$timeout', 'installService', '$transitions', 'toastService', 'devicesService',
function($rootScope, $state, cleepService, tasksPanelService, modalService, updateService, cleepUi, settings, $timeout,
    installService, $transitions, toast, devicesService) {

    var self = this;
    self.ipcRenderer = require('electron').ipcRenderer;
    self.taskFlashPanel = null;
    self.taskFlashPanelClosed = false;
    self.taskDownloadPanel = null;
    self.selectedToolbarItem = null;
    self.toolbarCollapsed = true;

    // toggle toolbar
    self.toggleToolbar = function() {
        self.toolbarCollapsed = !self.toolbarCollapsed;
    };

    // open page in content area (right side) handling 'openPage' event
    self.openPage = function(page) {
        // unselect all devices
        devicesService.selectDevice(null);

        // open specified page
        $state.go(page);
    };
    cleepUi.openPage = self.openPage;
    self.ipcRenderer.on('openpage', function(_event, page) {
        self.openPage(page);
    });

    // open modal handling 'openModal' event
    // data must be a map
    self.openModal = function(controllerName, templateUrl, data) {
        if( data===undefined || data===null ) {
            data = {}
        }
        modalService.open(controllerName, templateUrl, data);
    };
    cleepUi.openModal = self.openModal;
    self.ipcRenderer.on('openmodal', function(_event, controllerName, templateUrl, data) {
        self.openModal(controllerName, templateUrl, data);
    });

    // on close restart required task panel
    self.onCloseRestartRequiredTaskPanel = function() {
        // reset variable
        self.taskRestartRequiredPanel = null;
    };

    // restart application
    self.restartApplication = function() {
        // introduce small pause before closing application
        $timeout(function() {
            appUpdater.quitAndInstall();
        }, 1000);
    };

    // select toolbar icons
    $transitions.onEnter({}, function(_trans, state) {
        self.selectedToolbarItem = state.name;
    });

    // handle file download
    self.cancelDownload = function() {
        ipcRenderer.send('download-file-cancel');
    };
    self.ipcRenderer.on('download-file-status', function(event, status) {
        if( status.status=='alreadyrunning' ) {
            // download already running. this feature is limited to one at once
            toast.warning('File download is limited to 1 at once');
        }
        else if( status.status=='downloading' ) {
            // download is running, update percentage
            if( !self.taskDownloadPanel ) {
                self.taskDownloadPanel = tasksPanelService.addItem(
                    `Downloading ${status.filename}...`,
                    {
                        onAction: self.cancelDownload,
                        tooltip: 'Cancel',
                        icon: 'close-circle'
                    },
                    {
                        onClose: null,
                        disabled: false
                    },
                    true
                );
            }
        }
        else if( status.status=='canceled' || status.status=='success' || status.status=='failed' ) {
            // user message
            if( status.status=='canceled' ) {
                toast.info('Download canceled');
            }
            else if( status.status=='success' ) {
                toast.info('Download succeed');
            }
            else if( status.status=='failed' ) {
                toast.error('Download failed');
            }

            // reset task panel
            if( self.taskDownloadPanel ) {
                tasksPanelService.removeItem(self.taskDownloadPanel);
                self.taskDownloadPanel = null;
            }
        }
    });
    $rootScope.$on('download-file', function(_event, data) {
        ipcRenderer.send('download-file', data);
    });

    // handle restart required event adding a task panel
    $rootScope.$on('restartrequired', function(_event, _data) {
        if( !self.taskRestartRequired ) {
            self.taskRestartRequired = tasksPanelService.addItem(
                'Please restart application to apply changes.', 
                {
                    onAction: self.restartApplication,
                    tooltip: 'Restart now!',
                    icon: 'restart'
                },
                {
                    onClose: self.onCloseRestartRequiredTaskPanel,
                    disabled: false
                },
                false
            );
        }
    });

    // restart application
    $rootScope.$on('restart', function(_event, _data) {
        self.restartApplication();
    });

    // disable/enable application quit when process is running (like install process)
    $rootScope.$on('disablequit', function(_event, _data) {
        ipcRenderer.send('allow-quit', false);
    });
    $rootScope.$on('enablequit', function(_event, _data) {
        ipcRenderer.send('allow-quit', true);
    });

    // save changelog
    $rootScope.$on('savechangelog', function(_event, data) {
        ipcRenderer.send('save-changelog', data);
    });

    // controller init
    self.init = function() {
        // init websocket asap
        cleepService.connectWebSocket()
        .then(function() {
            logger.debug('Websocket connected, init angular stuff');

            // init update service
            updateService.init();
            // and check for updates (defer it to make almost sure core is launched)
            updateService.checkForUpdates();

            // init devices service
            devicesService.getDevices();

            // init install service
            installService.init();

            // first run? open application help
            if( settings.getSync('cleep.firstrun') )
            {
                logger.debug('First run');
                $timeout(function() {
                    self.openModal('emptyDialogController', 'js/help/helpdialog.html');
                }, 500);
                settings.setSync('cleep.firstrun', false);
            }
        });
    };

    self.init();

}]);
