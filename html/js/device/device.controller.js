/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.controller('deviceController', ['$rootScope', '$stateParams', 'loggerService', '$document', '$timeout', 'electronService', '$state',
function($rootScope, $stateParams, logger, $document, $timeout, electron, $state) {
    var self = this;
    logger.debug("deviceController stateParams", $stateParams);
    self.hostname = $stateParams.hostname;
    self.wv = document.getElementById('deviceWv');
    self.loading = true;

    // handle external link
    self.wv.addEventListener('new-window', (event) => {
        logger.debug('new-window event triggered', event.url);
        event.preventDefault();
        event.stopImmediatePropagation();

        // file download is handled by chrome automatically so no action is necessary
        if (!event.url.includes('/download?') && !event.url.includes('127.0.0.1')) {
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

    // error loading device page
    self.wv.addEventListener('did-fail-load', (event) => {
        logger.warn("Unable to open device page", {
            errorCode: event.errorCode,
            description: event.errorDescription,
            url : event.validatedURL,
        });

        var params = {
            hostname: $stateParams.hostname,
        };
        $state.go('deviceError', params);
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
        if (!self.wv || self.wv.isLoading()) {
            return;
        }

        logger.debug('Reloading device page');
        self.loading = true;
        self.wv.reloadIgnoringCache();
    });
}]);
