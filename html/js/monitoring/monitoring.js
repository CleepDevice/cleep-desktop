/**
 * Monitoring controller
 * Display messages from all devices received on bus
 */
angular
.module('Cleep')
.controller('monitoringController', ['monitoringService', function(monitoringService) {
    var self = this;
    self.monitoring = monitoringService;
}]);
