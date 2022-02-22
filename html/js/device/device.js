/**
 * Device controller
 */
angular
.module('Cleep')
.controller('deviceController', ['$rootScope', '$stateParams', 'loggerService', '$document', '$timeout', 'deviceService', 'downloadService',
function($rootScope, $stateParams, logger, $document, $timeout, deviceService, downloadService) {
    var self = this;
    self.shell = require('electron').shell;
    self.deviceUrl = $stateParams.url;
    self.wv = document.getElementById('deviceWv');
    self.deviceService = deviceService;

    // handle external link
    self.wv.addEventListener('new-window', (event) => {
        event.preventDefault();

        // detect download in url action
        logger.debug(event.url);
        if (event.url.indexOf('/download?') !== -1) {
            // trigger file download
            logger.debug('Trigger file download: ', event);
            downloadService.downloadUrl(event.url);
        } else {
            //open external link
            logger.debug('Opening external url: ', event);
            self.shell.openExternal(event.url);
        }
    });

    // device loading
    self.wv.addEventListener('did-start-loading', () => {
        deviceService.loading = true;
    });

    // device loaded
    self.wv.addEventListener('did-stop-loading', () => {
        $timeout(function() {
            deviceService.loading = false;
        }, 1000);
    }, true);

    // configure webview src as soon as document is ready
    $document.ready(function() {
        logger.debug('Opening "'+$stateParams.hostname+'" device url: '+$stateParams.url);
        self.wvAngular = angular.element(self.wv);
        self.wvAngular.attr('src', $stateParams.url + '?'+Date.now());
    });

    $rootScope.$on('reloaddevicepage', function(data) {
        self.wv.reloadIgnoringCache();
    });

}]);
