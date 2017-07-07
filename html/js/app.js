/**
 * Main application
 */
var Cleep = angular.module(
    'Cleep',
    ['ngMaterial', 'ngAnimate', 'ngMessages', 'ngRoute']
);

/**
 * Main application controller
 * It holds some generic stuff like polling request, loaded services...
 */
var mainController = function($rootScope, $scope, uiService)
{
    var self = this;

    self.refresh = function()
    {
        console.log('refresh button clicked');
        uiService.sendUi('coucou', null);
    };
};
Cleep.controller('mainController', ['$rootScope', '$scope', 'uiService', mainController]);

var prefsController = function($rootScope, $scope, uiService)
{
    var self = this;

    self.pref = 'proxy';
    self.proxyMode = null;
    self.proxyIp = null;
    self.proxyPort = null;

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
    self.getConfig();

};
Cleep.controller('prefsController', ['$rootScope', '$scope', 'uiService', prefsController]);


