var Cleep = angular.module('Cleep');

/**
 * About controller
 */
var aboutController = function($rootScope, $scope, cleepdesktopInfos)
{
    var self = this;
    self.cleepdesktopInfos = cleepdesktopInfos;
};
Cleep.controller('aboutController', ['$rootScope', '$scope', 'cleepdesktopInfos', aboutController]);
