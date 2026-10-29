angular
.module('Cleep')
.controller('deviceController', ['$scope', '$rootScope', '$stateParams', 'loggerService', '$document', '$timeout', 'electronService', '$state', 'downloadService', 'devicesService',
function($scope, $rootScope, $stateParams, logger, $document, $timeout, electron, $state, downloadService, devicesService) {
    var self = this;
    logger.debug("deviceController stateParams", $stateParams);
    self.hostname = $stateParams.hostname;
    self.webview = document.getElementById('deviceWebview');
    self.loading = true;
    self._unsubscribeWebview = null;
    self._navigatedToError = false;
    self._srcSet = false;

    self.goDeviceError = function(extra) {
        if (self._navigatedToError) {
            return;
        }
        self._navigatedToError = true;
        var params = Object.assign({
            hostname: $stateParams.hostname,
            url: $stateParams.url,
            deviceUuid: $stateParams.deviceUuid,
        }, extra || {});
        $state.go('deviceError', params);
    };

    self.bindGatewayWebview = function() {
        if (!$stateParams.deviceUuid || typeof self.webview.getWebContentsId !== 'function') {
            return Promise.resolve();
        }
        var gateway = devicesService.findGatewayDevice();
        var gatewayDeviceUuid = ($stateParams.viaGateway && gateway) ? gateway.uuid : undefined;
        try {
            return electron.devices.bindWebview({
                webContentsId: self.webview.getWebContentsId(),
                deviceUuid: $stateParams.deviceUuid,
                gatewayDeviceUuid: gatewayDeviceUuid,
            }).catch(function(error) {
                logger.warn('Unable to bind gateway webview', error);
            });
        } catch (error) {
            logger.warn('Unable to bind gateway webview', error);
            return Promise.resolve();
        }
    };

    self.setWebviewSrc = function() {
        if (self._srcSet) {
            return;
        }
        self._srcSet = true;
        self.webviewAngular.attr('src', $stateParams.url + '?' + Date.now());
    };

    
    // handle external link (unsubscribe when leaving the device page)
    self._unsubscribeWebview = electron.registerWebview(self.webview);
    $scope.$on('$destroy', function() {
        if (self._unsubscribeWebview) {
            self._unsubscribeWebview();
            self._unsubscribeWebview = null;
        }
    });

    self.webview.addEventListener('new-window', (event) => {
        const url = event.details.url;
        logger.debug('new-window event triggered', url);

        if (!url) {
            logger.error('No url specified in new-window event!');
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        if (url.includes('/download?') || url.includes('127.0.0.1')) {
            downloadService.downloadUrl(url);
            return;
        }

        // open external link
        electron.shell.openUrl(url);
    });

    // disable pre-loading to avoid blank page
    self.webview.addEventListener('dom-ready', () => {
        $timeout(function() {
            self.loading = false;
        }, 0);
        // Re-bind after attach so webContentsId is valid
        self.bindGatewayWebview();
    });

    // error loading device page
    self.webview.addEventListener('did-fail-load', (event) => {
        logger.warn("Unable to open device page", {
            errorCode: event.errorCode,
            description: event.errorDescription,
            url : event.validatedURL,
        });
        self.goDeviceError({ url: event.validatedURL || $stateParams.url });
    });

    // HTTP error on main frame (e.g. ngrok offline endpoint → 404/502)
    self.webview.addEventListener('http-error', (event) => {
        logger.warn('Device page returned HTTP error', event.details);
        self.goDeviceError({
            url: (event.details && event.details.url) || $stateParams.url,
        });
    });

    // configure webview src as soon as document is ready
    $document.ready(function() {
        $timeout(function() {
            self.loading = true;
        }, 0);
        logger.debug('Opening "'+$stateParams.hostname+'" device url: '+$stateParams.url, {
            viaGateway: $stateParams.viaGateway,
        });
        self.webviewAngular = angular.element(self.webview);
        self.bindGatewayWebview().finally(function() {
            self.setWebviewSrc();
        });
    });

    $rootScope.$on('reload-device-page', function() {
        if (!self.webview || self.webview.isLoading()) {
            return;
        }

        logger.debug('Reloading device page');
        self._navigatedToError = false;
        self.loading = true;
        self.webview.reloadIgnoringCache();
    });
}]);
