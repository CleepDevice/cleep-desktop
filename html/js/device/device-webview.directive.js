/**
 * One persistent <webview> bound to a contentTabs device session.
 */
angular
.module('Cleep')
.directive('deviceWebview', ['$timeout', '$rootScope', 'contentTabsService', 'devicesService', 'electronService', 'downloadService', 'loggerService',
function($timeout, $rootScope, contentTabs, devicesService, electron, downloadService, logger) {
    return {
        restrict: 'E',
        scope: {
            session: '=',
        },
        template: '<webview disablewebsecurity allowpopups class="device-webview-el" src=""></webview>',
        link: function(scope, element) {
            var webview = element[0].querySelector('webview');
            var unsubscribers = [];
            var srcSet = false;
            var navigatedToError = false;

            // Avoid inline baseline gap under <webview> (host scrollbar with huge thumb).
            element.css({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' });
            if (webview && webview.style) {
                webview.style.display = 'flex';
                webview.style.width = '100%';
                webview.style.height = '100%';
                webview.style.border = '0';
                webview.style.outline = '0';
                webview.style.overflow = 'hidden';
                webview.style.verticalAlign = 'top';
            }

            function bindGateway() {
                if (!scope.session || typeof webview.getWebContentsId !== 'function') {
                    return Promise.resolve();
                }
                var gateway = devicesService.findGatewayDevice();
                var gatewayDeviceUuid = (scope.session.viaGateway && gateway) ? gateway.uuid : undefined;
                try {
                    return electron.devices.bindWebview({
                        webContentsId: webview.getWebContentsId(),
                        deviceUuid: scope.session.deviceUuid,
                        gatewayDeviceUuid: gatewayDeviceUuid,
                    }).catch(function(error) {
                        logger.warn('Unable to bind gateway webview', error);
                    });
                } catch (error) {
                    logger.warn('Unable to bind gateway webview', error);
                    return Promise.resolve();
                }
            }

            function setSrc(force) {
                if (!scope.session || !scope.session.url) {
                    return;
                }
                if (srcSet && !force) {
                    return;
                }
                srcSet = true;
                navigatedToError = false;
                contentTabs.setSessionLoading(scope.session.deviceUuid, true);
                var sep = scope.session.url.indexOf('?') >= 0 ? '&' : '?';
                // cleepdesktop=1 helps rpcserver inject embed flag even if header is stripped.
                webview.setAttribute('src', scope.session.url + sep + 'cleepdesktop=1&_=' + Date.now());
            }

            function goError(extraUrl) {
                if (navigatedToError) {
                    return;
                }
                navigatedToError = true;
                contentTabs.setSessionError(scope.session.deviceUuid, true);
                void extraUrl;
            }

            var unsubWebview = electron.registerWebview(webview);
            if (typeof unsubWebview === 'function') {
                unsubscribers.push(unsubWebview);
            }

            webview.addEventListener('new-window', function(event) {
                var url = event.details && event.details.url;
                if (!url) {
                    return;
                }
                event.preventDefault();
                event.stopImmediatePropagation();
                if (url.includes('/download?') || url.includes('127.0.0.1')) {
                    downloadService.downloadUrl(url);
                    return;
                }
                electron.shell.openUrl(url);
            });

            function applyDesktopEmbedChrome() {
                // Hide device hostname chrome and avoid 100%-height + sibling overflow
                // (cl-app-fab after ng-view) which shows a useless page scrollbar.
                var css = [
                    'html, body { height: 100% !important; max-height: 100% !important; overflow: hidden !important; margin: 0 !important; }',
                    '.toolbar-shell { display: none !important; }',
                    'body > md-content {',
                    '  position: absolute !important; inset: 0 !important;',
                    '  height: auto !important; max-height: none !important;',
                    '  overflow: hidden !important; display: flex !important; flex-direction: column !important;',
                    '}',
                    'body > md-content > div[ng-controller] {',
                    '  flex: 1 1 auto !important; min-height: 0 !important; height: auto !important;',
                    '  display: flex !important; flex-direction: column !important; overflow: hidden !important;',
                    '}',
                    'body > md-content [ng-view] {',
                    '  flex: 1 1 auto !important; min-height: 0 !important; height: auto !important;',
                    '  max-height: 100% !important; overflow-x: hidden !important; overflow-y: auto !important;',
                    '}',
                    'cl-app-fab { position: fixed !important; width: 0 !important; height: 0 !important;',
                    '  overflow: visible !important; pointer-events: none !important; }',
                    'cl-app-fab .md-button, cl-app-fab md-fab-speed-dial { pointer-events: auto !important; }',
                ].join('\n');
                var apply = function() {
                    if (typeof webview.insertCSS === 'function') {
                        return Promise.resolve(webview.insertCSS(css));
                    }
                    return Promise.resolve();
                };
                apply()
                    .then(function() {
                        if (typeof webview.executeJavaScript !== 'function') {
                            return;
                        }
                        return webview.executeJavaScript(
                            '(function(){try{'
                            + 'window.__CLEEP_DESKTOP__=1;'
                            + 'document.documentElement.classList.add("cleep-desktop-embed");'
                            + 'document.body&&document.body.classList.add("cleep-desktop-embed");'
                            + 'var s=document.querySelector(".toolbar-shell");'
                            + 'if(s){s.setAttribute("hidden","hidden");s.style.display="none";}'
                            + '}catch(e){}})();',
                        );
                    })
                    .catch(function(error) {
                        logger.warn('Unable to apply CleepDesktop embed chrome', error);
                    });
            }

            webview.addEventListener('dom-ready', function() {
                applyDesktopEmbedChrome();
                $timeout(function() {
                    if (scope.session) {
                        contentTabs.setSessionLoading(scope.session.deviceUuid, false);
                    }
                }, 0);
                bindGateway();
            });

            webview.addEventListener('did-fail-load', function(event) {
                // Ignore aborted/cancelled loads
                if (event.errorCode === -3) {
                    return;
                }
                logger.warn('Unable to open device page', {
                    errorCode: event.errorCode,
                    description: event.errorDescription,
                    url: event.validatedURL,
                    deviceUuid: scope.session && scope.session.deviceUuid,
                });
                goError(event.validatedURL);
            });

            webview.addEventListener('http-error', function(event) {
                logger.warn('Device page returned HTTP error', event.details);
                goError(event.details && event.details.url);
            });

            unsubscribers.push($rootScope.$on('content-tabs-reload-session', function(_e, deviceUuid) {
                if (!scope.session || scope.session.deviceUuid !== deviceUuid) {
                    return;
                }
                if (webview.isLoading && webview.isLoading()) {
                    return;
                }
                navigatedToError = false;
                srcSet = false;
                setSrc(true);
            }));

            unsubscribers.push($rootScope.$on('reload-device-page', function() {
                if (!scope.session) {
                    return;
                }
                var active = contentTabs.getActiveSession();
                if (!active || active.deviceUuid !== scope.session.deviceUuid) {
                    return;
                }
                contentTabs.reloadSession(scope.session.deviceUuid);
            }));

            scope.$watch('session.url', function(url) {
                if (url) {
                    $timeout(function() {
                        bindGateway().finally(function() {
                            setSrc(false);
                        });
                    }, 0);
                }
            });

            scope.$on('$destroy', function() {
                unsubscribers.forEach(function(unsub) {
                    if (typeof unsub === 'function') {
                        unsub();
                    }
                });
                unsubscribers = [];
            });
        },
    };
}]);
