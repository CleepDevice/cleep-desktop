var Cleep = angular.module('Cleep')

/**
 * Device controller
 */
var deviceController = function($rootScope, $scope, $stateParams, $timeout)
{
    var self = this;
    self.shell = require('electron').shell;
    self.deviceUrl = $stateParams.url;
    self.wv = document.getElementById('deviceWv');
    self.loading = false;

    //handle external link
    self.wv.addEventListener('new-window', function(event) {
        event.preventDefault();
        self.shell.openExternal(event.url);
    });
    
    //device loading
    self.wv.addEventListener('did-start-loading', function() {
        console.log('Start loading device');
        self.loading = true;
    });

    //device loaded
    self.wv.addEventListener('did-stop-loading', function() {
        console.log('Finish loading device');
        $timeout(function() {
            self.loading = false;
        }, 2000);
    });

    //configure webview src
    self.wvAngular = angular.element(self.wv);
    self.wvAngular.attr('src', $stateParams.url);
};
Cleep.controller('deviceController', ['$rootScope', '$scope', '$stateParams', '$timeout', deviceController]);

