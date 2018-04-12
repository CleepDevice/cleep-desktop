const electron = require('electron');
const {remote, ipcRenderer} = electron;
const cleepdesktopVersion = remote.getGlobal('cleepdesktopVersion');
const logger = remote.getGlobal('logger');
const appUpdater = remote.getGlobal('appUpdater');
const settings = remote.getGlobal('settings');
let cleepUi = {
    openPage: null,
    openModal: null
};

//declare angular module
var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ui.router', 'ngSanitize', 'ngWebSocket']);

//globals
//keep track of all devices messages while CleepDesktop is running
Cleep.value('deviceMessages', []);

//inject electron values
Cleep.value('logger', logger)
    .value('appUpdater', appUpdater)
    .value('settings', settings)
    .value('cleepdesktopVersion', cleepdesktopVersion)
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
Cleep.config(['$stateProvider', '$urlRouterProvider', function($stateProvider, $urlRouterProvider) {
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
            controller: 'autoInstallController',
            controllerAs: 'ctl',
            templateUrl: 'js/install/installAuto.html'
        })
        .state('installManually', {
            url: '/installManually',
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
var emptyController = function($rootScope, $scope, $state)
{
    var self = this;
};
Cleep.controller('emptyController', ['$rootScope', '$scope', '$state', emptyController]);

/**
 * Empty dialog controller
 * Add minimal stuff to handle properly dialog
 */
var emptyDialogController = function($rootScope, $scope, $state, closeModal)
{
    var self = this;

    self.closeModal = closeModal;
};
Cleep.controller('emptyDialogController', ['$rootScope', '$scope', '$state', 'closeModal', emptyDialogController]);

/**
 * Cleep controller
 */
var cleepController = function($rootScope, $scope, $state, cleepService, tasksPanelService, modalService, deviceMessages, 
                            updateService, cleepUi, settings, $timeout, installService)
{
    var self = this;
    self.ipcRenderer = require('electron').ipcRenderer;
    self.taskFlashPanel = null;
    self.taskFlashPanelClosed = false;

    //Open page in content area (right side) handling 'openPage' event
    self.openPage = function(page)
    {
        $state.go(page);
    };
    cleepUi.openPage = self.openPage;
    self.ipcRenderer.on('openPage', function(event, page) {
        self.openPage(page);
    });

    //Open modal handling 'openModal' event
    self.openModal = function(controllerName, templateUrl)
    {
        modalService.open(controllerName, templateUrl);
    };
    cleepUi.openModal = self.openModal;
    self.ipcRenderer.on('openModal', function(event, controllerName, templateUrl) {
        self.openModal(controllerName, templateUrl);
    });

    //Jump to auto install page
    self.jumpToInstallAuto = function() {
        $state.go('installAuto');
    };

    //On close flash task panel
    self.onCloseFlashTaskPanel = function()
    {
        //reset variable
        self.taskFlashPanel = null;
        self.taskFlashPanelClosed = true;
    };

    //On close restart required task panel
    self.onCloseRestartRequiredTaskPanel = function()
    {
        //reset variable
        self.taskRestartRequiredPanel = null;
    };

    //Restart appliation
    self.restartApplication = function()
    {
        //introduce small sleep before closing application
        $timeout(function() {
            appUpdater.quitAndInstall(true, true);
        }, 1000);
    };

    //Add flash task panel info
    $rootScope.$on('flash', function(event, data) {
        if( !data )
            return;

        if( data.status>=5 )
        {
            //flash is terminated
            tasksPanelService.removeItem(self.taskFlashPanel);
            self.taskFlashPanel = null;
            self.taskFlashPanelClosed = false;
        }
        else if( self.taskFlashPanelClosed )
        {
            //flash task panel closed by user, do not open it again
        }
        else if( data.status>0 && !self.taskFlashPanel )
        {
            //flash is started
            self.taskFlashPanel = tasksPanelService.addItem(
                'Installing Cleep on drive...',
                {
                    onAction: self.jumpToInstallAuto,
                    tooltip: 'Go to install',
                    icon: 'sd'
                },
                {
                    onClose: self.onCloseFlashTaskPanel,
                    disabled: false
                },
                true
            );
        }
    });

    //Watch for device messages event to append them in global value deviceMessages
    //message are handled in main application to keep the messages alive.
    $rootScope.$on('message', function(event, data) {
        if( !data )
            return;

        //append at beginning new message
        logger.debug('New message:', data);
        deviceMessages.unshift(data);
    });

    //Handle restart required event adding a task panel
    $rootScope.$on('restartrequired', function(event, data) {
        if( !self.taskRestartRequired )
        {
            self.taskRestartRequired = tasksPanelService.addItem(
                'Restart application to apply changes.', 
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

    //disable/enable application quit when process is running (like flash)
    $rootScope.$on('disablequit', function(event, data) {
        ipcRenderer.send('allow-quit', false);
    });
    $rootScope.$on('enablequit', function(event, data) {
        ipcRenderer.send('allow-quit', true);
    });

    //Controller init
    self.init = function()
    {
        //init websocket asap
        cleepService.connectWebSocket()
        .then(function() {
            logger.debug('Websocket connected, init angular stuff');

            //init update service
            updateService.init();
            //and check for updates (defer it to make almost sure core is launched)
            updateService.checkForUpdates();

            //init install service
            installService.init();

            //first run? open application help
            if( settings.get('cleep.firstrun') )
            {
                logger.debug('First run');
                $timeout(function() {
                    self.openModal('emptyDialogController', 'js/help/helpdialog.html');
                }, 1000);
                settings.set('cleep.firstrun', false);
            }
        });
    };

    self.init();

};
Cleep.controller('cleepController', ['$rootScope', '$scope', '$state', 'cleepService', 'tasksPanelService', 'modalService', 
                                    'deviceMessages', 'updateService', 'cleepUi', 'settings', '$timeout', 'installService', cleepController]);

