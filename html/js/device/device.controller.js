angular
.module('Cleep')
.controller('deviceController', ['$rootScope', '$stateParams', 'loggerService', '$document', '$timeout', 'electronService',
function($rootScope, $stateParams, logger, $document, $timeout, electron) {
    var self = this;
    self.deviceUrl = $stateParams.url;
    self.wv = document.getElementById('deviceWv');
    self.loading = true;

    // handle external link
    self.wv.addEventListener('new-window', (event) => {
        logger.debug('new-window event triggered', event.url);
        event.preventDefault();
        event.stopImmediatePropagation();

        // file download is handled by chrome automatically so no action is necessary
        if (!event.url.includes('/download?')) {
            //open external link
            electron.send('open-url-in-browser', event.url);
        }
    });

    // disable pre-loading to avoid blank page
    self.wv.addEventListener('dom-ready', () => {
        $timeout(function() {
            self.loading = false;
        }, 0);
    });

    // configure webview src as soon as document is ready
    $document.ready(function() {
        $timeout(function() {
            self.loading = true;
        }, 0);
        logger.debug('Opening "'+$stateParams.hostname+'" device url: '+$stateParams.url);
        self.wvAngular = angular.element(self.wv);
        self.wvAngular.attr('src', $stateParams.url + '?'+Date.now());
    });

    $rootScope.$on('reload-device-page', function() {
        self.wv.reloadIgnoringCache();
    });
}]);
