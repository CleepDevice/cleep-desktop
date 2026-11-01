angular
.module('Cleep')
.controller('deviceController', ['$stateParams', 'loggerService',
function($stateParams, logger) {
    // Device chrome lives in the shared content header + webview pool (index.html).
    logger.debug('deviceController (pool host)', $stateParams);
}]);
