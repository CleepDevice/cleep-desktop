/**
 * Device service handles selected device
 */
var deviceService = function($rootScope, cleepService)
{
    var self = this;
    self.loading = true;

    
}

var Cleep = angular.module('Cleep');
Cleep.service('deviceService', ['$rootScope', 'cleepService', deviceService]);
