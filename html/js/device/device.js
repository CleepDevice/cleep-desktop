var Cleep = angular.module('Cleep')

/**
 * Device controller
 */
var deviceController = function($rootScope, $scope, $stateParams, logger, $document, $timeout)
{
    var self = this;
    self.shell = require('electron').shell;
    self.deviceUrl = $stateParams.url;
    self.wv = document.getElementById('deviceWv');
    self.loading = true;

    //handle external link
    self.wv.addEventListener('new-window', function(event) {
        event.preventDefault();

        //detect download in url action
        if( event.url.indexOf('/download?')!==-1 ) {
            //trigger file download
            logger.debug('Trigger file download: '+event.url);
            logger.debug(event);
            $rootScope.$broadcast('downloadfile', {url: event.url});
        } else {
            //open external link
            logger.debug('Opening external url: '+event.url);
            self.shell.openExternal(event.url);
        }
    });

    //device loading
    self.wv.addEventListener('did-start-loading', function() {
        self.loading = true;
    });

    //device loaded
    self.wv.addEventListener('did-stop-loading', function() {
        $timeout(function() {
            self.loading = false;
        }, 1000);
    });

    //configure webview src as soon as document is ready
    $document.ready(function() {
        logger.debug('Opening "'+$stateParams.hostname+'" device url: '+$stateParams.url);
        self.wvAngular = angular.element(self.wv);
        self.wvAngular.attr('src', $stateParams.url);
    });

};
Cleep.controller('deviceController', ['$rootScope', '$scope', '$stateParams', 'logger', '$document', '$timeout', deviceController]);

