//var log = require('electron-log');


/*var left = document.getElementById('leftPanel');
var leftPanel = angular.element(left);
leftPanel.attr('src', 'http://localhost:5610/devices.html');*/

/*setTimeout(function() {
log.info('plouf');
var right = document.getElementById('rightPanel');
var rightPanel = angular.element(right);
console.log(rightPanel);
//rightPanel.attr('src', 'http://localhost:5610/homepage.html');
//right.loadURL('http://localhost:5610/homepage.html');
//right.reloadIgnoringCache()
//right.loadUrlL('http://www.google.fr');
}, 1000);*/

/*var net = require('net');
var s = new net.Socket();
s.on('data', function(data) {
    log.info('received data ', data);
});
s.connect(5611, function() {
    var test = {
        command: 'helloworld',
        params: {
            param1: 'yop',
            param2: 'ploum'
        }
    };
    var j = JSON.stringify(test);
    s.write(j);
});*/

//https://github.com/socketio/socket.io-client
/*var socket = io.connect('http://localhost:5611');
socket.on('connect', function() {
    log.info('connected');
});
socket.on('disconnect', function() {
    log.info('disconnect');
});
socket.on('event', function(data) {
    log.info('event', data);
});
function mysend() {
    log.info('->send data');
    log.info(socket.emit('pouet'));
    setTimeout(function(){ mysend(); }, 1000);
}
mysend();*/


/*doens't work
document.addEventListener('DOMContentLoaded', function () {
    log.info('ok');
    document.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setTimeout(function () {
            var path = e.target.href;
            //ipcRenderer.sendToHost('element-clicked', path);
            log.info('click handled');
        }, 100);
        return false;
    }, true);
});*/

/*right.addEventListener('will-navigate', function(event) {
    log.info('wv navigate');
});
right.addEventListener('new-window', function() {
    log.info('wv new window');
});*/

var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ui.router', 'ngSanitize', 'ngWebSocket']);


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
 * Bytes to human readble
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

Cleep.config(['$stateProvider', '$urlRouterProvider', function($stateProvider, $urlRouterProvider) {
    $stateProvider
        .state('default', {
            url: '/',
            templateUrl: 'js/welcome/welcome.html'
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
                url: null
            },
            controller: 'deviceController',
            controllerAs: 'ctl',
            templateUrl: 'js/device/device.html'
        });

    $urlRouterProvider.otherwise('/');
}]);

/**
 * Empty controller
 */
var emptyController = function($rootScope, $scope, $state)
{
    var self = this;

    self.openPage = function()
    {
        //$rootScope.openPage('/preferences');
        $state.go('preferences');
    }
};
Cleep.controller('emptyController', ['$rootScope', '$scope', '$state', emptyController]);

var cleepController = function($rootScope, $scope, $state, cleepService, tasksPanelService)
{
    var self = this;
    self.ipcRenderer = require('electron').ipcRenderer;
    self.taskFlash = null;
    self.taskUpdate = null;

    //handle 'openPage' menu event
    self.ipcRenderer.on('openPage', function(event, page) {
        $state.go(page);
    });

    //jump to updates page
    self.jumpToUpdates = function() {
        $state.go('updates');
    };

    //jump to auto install page
    self.jumpToAutoInstall = function() {
        $state.go('installAuto');
    };

    //add flash task info
    $rootScope.$on('flash', function(event, data) {
        if( !data )
            return;

        if( data.status>=5 )
        {
            //flash is terminated
            tasksPanelService.removeItem(self.taskFlash);
            self.taskFlash = null;
        }
        else if( data.status>0 && !self.taskFlash )
        {
            //flash is started
            self.taskFlash = tasksPanelService.addItem('Installing cleep on drive...', self.jumpToAutoInstall, true, true);
        }
    });

    //add update task info
    $rootScope.$on('updates', function(event, data) {
        if( !data )
            return;

        if( data.etcherstatus>=3 || data.cleepstatus>=3 )
        {
            //update is terminated
            tasksPanelService.removeItem(self.taskUpdate);
            self.taskUpdate = null;
        }
        else if( !self.taskUpdate && (data.etcherstatus>0 || data.cleepstatus>0) )
        {
            //update is started
            self.taskUpdate = tasksPanelService.addItem('Updating software version...', self.jumpToUpdates, true, true);
        }
    });

    //init websocket
    cleepService.connectWebSocket();

};
Cleep.controller('cleepController', ['$rootScope', '$scope', '$state', 'cleepService', 'tasksPanelService', cleepController]);

