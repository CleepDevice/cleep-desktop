/**
 * Application modules configuration
 * This file configures:
 *  - router
 *  - theme
 *  - fonts provider
 */

var Cleep = angular.module('Cleep');

/**
 * Routes configuration
 */
Cleep.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $locationProvider.hashPrefix('!');
    $routeProvider
        .when('/dashboard', {
            template: '<div dashboard-directive></div>'
        })
        .when('/configuration', {
            template: '<div configuration-directive></div>'
        })
        .when('/modules', {
            template: '<div modules-directive></div>'
        })
        .when('/install', {
            template: '<div install-directive></div>'
        })
        .when('/module/:name', {
            template: '<div module-directive></div>'
        })
        .when('/module/actions/edit/:script', {
            template: '<div codemirror-python-directive></div>'
        })
        .otherwise({
            redirectTo: '/dashboard'
        });
}]);

/**
 * Theme configuration
 */
Cleep.config(['$mdThemingProvider', function($mdThemingProvider) {
    $mdThemingProvider
        .theme('default')
        .primaryPalette('blue-grey')
        .accentPalette('red')
        .backgroundPalette('grey');
    $mdThemingProvider
        .theme('dark')
        .primaryPalette('amber')
        .accentPalette('blue')
        .dark();

    /*$mdThemingProvider
        .theme('default')
        .primaryPalette('blue')
        .accentPalette('orange')
        .backgroundPalette('grey');
    $mdThemingProvider
        .theme('dark')
        .primaryPalette('blue')
        .accentPalette('orange')
        .backgroundPalette('grey')
        .dark();*/
}]);

/**
 * Font configuration
 * Disabled for now, ligatures are not supported by typicons
 */
/*RaspIot.config(['$mdIconProvider', function($mdIconProvider) {
    $mdIconProvider
        .iconSet('typicons', 'fonts/typicons.svg', 24)
}]);*/
