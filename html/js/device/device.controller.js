angular
.module('Cleep')
.controller('deviceController', ['$rootScope', '$stateParams', 'loggerService', '$document', '$timeout', 'deviceService', 'downloadService', 'electronService',
function($rootScope, $stateParams, logger, $document, $timeout, deviceService, downloadService, electron) {

    var self = this;
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
            electron.send('open-url-in-browser', event.url);
        }
    });

    // disable pre-loading to avoid blank page
    self.wv.addEventListener('dom-ready', () => {
        $timeout(function() {
            deviceService.loading = false;
        }, 0);
    });

    // configure webview src as soon as document is ready
    $document.ready(function() {
        $timeout(function() {
            deviceService.loading = true;
        }, 0);
        logger.debug('Opening "'+$stateParams.hostname+'" device url: '+$stateParams.url);
        self.wvAngular = angular.element(self.wv);
        self.wvAngular.attr('src', $stateParams.url + '?'+Date.now());
    });

    $rootScope.$on('reload-device-page', function() {
        self.wv.reloadIgnoringCache();
    });

}]);
