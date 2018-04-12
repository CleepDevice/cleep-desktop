var Cleep = angular.module('Cleep');

/**
 * About controller
 */
var aboutController = function($rootScope, $scope, cleepdesktopVersion)
{
    var self = this;
    self.cleepdesktopVersion = cleepdesktopVersion;
};
Cleep.controller('aboutController', ['$rootScope', '$scope', 'cleepdesktopVersion', aboutController]);
