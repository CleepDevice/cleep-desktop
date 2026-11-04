
/**
 * Theme configuration
 */
 angular.module('Cleep').config(['$mdThemingProvider', function($mdThemingProvider) {
    $mdThemingProvider
        .theme('default')
        .primaryPalette('blue-grey')
        .accentPalette('red')
        .backgroundPalette('grey');
    $mdThemingProvider
        .theme('alt')
        .backgroundPalette('blue-grey')
        .dark();
}]);

/**
 * MDI font configuration
 */
 angular.module('Cleep').config(['$mdIconProvider', function($mdIconProvider) {
    $mdIconProvider.defaultIconSet('fonts/mdi.svg');
    // Monochrome Cleep mark (currentColor) — same tone as MDI config icons.
    $mdIconProvider.icon('cleep', 'images/cleep-mark.svg');
}]);

/**
 * Routes configuration
 */
 angular.module('Cleep').config(['$stateProvider', '$urlRouterProvider', function($stateProvider, $urlRouterProvider) {
    $stateProvider
        .state('default', {
            url: '/',
            templateUrl: 'js/homepage/homepage.html'
        })
        .state('help', {
            url: '/help',
            templateUrl: 'js/help/help.html'
        })
        .state('about', {
            url: '/about',
            controller: 'aboutController',
            controllerAs: 'ctl',
            templateUrl: 'js/about/about.html'
        })
        .state('support', {
            url: '/support',
            controller: 'supportController',
            controllerAs: 'ctl',
            templateUrl: 'js/support/support.html'
        })

        .state('updates', {
            url: '/updates',
            controller: 'updatesController',
            controllerAs: 'ctl',
            templateUrl: 'js/updates/updates.html'
        })
        .state('installAuto', {
            url: '/installAuto',
            controller: 'installController',
            controllerAs: 'ctl',
            templateUrl: 'js/install/install-auto.html'
        })
        .state('installManually', {
            url: '/installManually',
            controller: 'installController',
            controllerAs: 'ctl',
            templateUrl: 'js/install/install-manually.html'
        })
        .state('device', {
            url: '/device',
            params: {
                url: null,
                hostname: null,
                deviceUuid: null,
                auth: null,
                viaGateway: false,
            },
            controller: 'deviceController',
            controllerAs: 'ctl',
            templateUrl: 'js/device/device.html'
        })
        .state('deviceAuth', {
            url: '/deviceAuth',
            params: {
                url: null,
                hostname: null,
                deviceUuid: null,
                errorCode: null,
                newTab: false,
                viaGateway: false,
            },
            controller: 'deviceAuthController',
            controllerAs: 'ctl',
            templateUrl: 'js/device-auth/device-auth.html'
        })
        .state('deviceError', {
            url: '/deviceError',
            params: {
                url: null,
                hostname: null,
                deviceUuid: null,
            },
            controller: 'deviceErrorController',
            controllerAs: 'ctl',
            templateUrl: 'js/device-error/device-error.html'
        })
        .state('monitoring', {
            url: '/monitoring',
            controller: 'monitoringController',
            controllerAs: 'ctl',
            templateUrl: 'js/monitoring/monitoring.html'
        })
        .state('developerSync', {
            url: '/developer/sync',
            controller: 'developerSyncController',
            controllerAs: 'ctl',
            templateUrl: 'js/developer/developer-sync.html'
        })
        .state('devPlayground', {
            url: '/dev/playground',
            controller: 'devPlaygroundController',
            controllerAs: 'ctl',
            templateUrl: 'js/dev/dev-playground.html'
        });

    $urlRouterProvider.otherwise('/');
}]);

angular.module('Cleep').config(function($mdAriaProvider) {
    // Globally disables all ARIA warnings.
    $mdAriaProvider.disableWarnings();
});

/**
 * Forward AngularJS exceptions to Sentry when crash reports are enabled.
 */
angular.module('Cleep').factory('$exceptionHandler', [function() {
    return function cleepExceptionHandler(exception, cause) {
        if (typeof console !== 'undefined' && console.error) {
            console.error(exception, cause);
        }
        if (
            window.cleep
            && window.cleep.crashReportEnabled
            && window.CleepSentry
            && typeof window.CleepSentry.captureException === 'function'
        ) {
            window.CleepSentry.captureException(exception);
        }
    };
}]);
