var Cleep = angular.module('Cleep')

/**
 * Device controller
 */
var deviceController = function($rootScope, $scope, $stateParams)
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
    
    //add loader listener
    self.wv.addEventListener('did-start-loading', function() {
        self.loading = true;
    });
    self.wv.addEventListener('did-stop-loading', function() {
        self.loading = false;
    });

    //configure webview src
    self.wvAngular = angular.element(self.wv);
    self.wvAngular.attr('src', $stateParams.url);
};
Cleep.controller('deviceController', ['$rootScope', '$scope', '$stateParams', deviceController]);

