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

var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ui.router', 'ngSanitize']);


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

var cleepController = function($rootScope, $scope, $state, cleepService)
{
    var self = this;
    self.ipcRenderer = require('electron').ipcRenderer;

    //handle 'openPage' menu event
    self.ipcRenderer.on('openPage', function(event, page) {
        $state.go(page);
    });

    //display infos about ended installation
    /*$rootScope.on('flash', function(event, data) {
        if( data.status>=5 )
        {
            //flash is terminated
            toast.info('Installation is terminated');
        }
    });*/

    //init websocket
    cleepService.connectWebSocket();

};
Cleep.controller('cleepController', ['$rootScope', '$scope', '$state', 'cleepService', cleepController]);

