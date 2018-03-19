var Cleep = angular.module('Cleep')

/**
 * Device controller
 */
var deviceController = function($rootScope, $scope, $stateParams, $timeout, logger)
{
    var self = this;
    self.shell = require('electron').shell;
    self.deviceUrl = $stateParams.url;
    self.wv = document.getElementById('deviceWv');
    self.loading = true;

    //handle external link
    self.wv.addEventListener('new-window', function(event) {
        event.preventDefault();
        logger.debug('Opening external url: '+event.url);
        self.shell.openExternal(event.url);
    });
    
    //device loading
    self.wv.addEventListener('did-start-loading', function() {
        console.log('didstartloading');
        self.loading = true;
    });

    //device loaded
    self.wv.addEventListener('did-stop-loading', function() {
        console.log('didstoploading');
        $timeout(function() {
            self.loading = false;
        }, 1000);
    });

    //configure webview src
    $timeout(function() {
        logger.debug('Opening "'+$stateParams.hostname+'" device url: '+$stateParams.url);
        self.wvAngular = angular.element(self.wv);
        self.wvAngular.attr('src', $stateParams.url);
    }, 500);

};
Cleep.controller('deviceController', ['$rootScope', '$scope', '$stateParams', '$timeout', 'logger', deviceController]);

