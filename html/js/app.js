var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ngRoute']);

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
}]);

/**
 * Empty controller
 */
var emptyController = function($rootScope, $scope)
{
    var self = this;
};
Cleep.controller('emptyController', ['$rootScope', '$scope', emptyController]);

/**
 * Devices controller
 */
var devicesController = function($rootScope, $scope)
{
    var self = this;

    //scan devices
    self.refresh = function()
    {
    };
};
Cleep.controller('devicesController', ['$rootScope', '$scope', devicesController]);

/**
 * Homepage controller
 */
var homepageController = function($rootScope, $scope, uiService)
{
    var self = this;

    self.refresh = function()
    {
        console.log('refresh button clicked');
        uiService.sendUi('coucou', null);
    };


};
Cleep.controller('homepageController', ['$rootScope', '$scope', 'uiService', homepageController]);

/**
 * Preferences controller
 */
var preferencesController = function($rootScope, $scope, uiService)
{
    var self = this;

    self.pref = 'proxy';
    self.proxyMode = null;
    self.proxyIp = null;
    self.proxyPort = null;

    self.init = function()
    {
        self.getConfig();
    };

    //get configuration
    self.getConfig = function()
    {
        uiService.getConfig()
            .then(function(config) {
                console.log(config);
                self.proxyMode = config.proxymode;
                self.proxyIp = config.proxyip;
                self.proxyPort = config.proxyport;
            });
    };

    //go back
    self.back = function()
    {
        uiService.back();
    }

    self.init();
};
Cleep.controller('preferencesController', ['$rootScope', '$scope', 'uiService', preferencesController]);


