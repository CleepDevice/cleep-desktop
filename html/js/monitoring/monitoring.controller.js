/**
 * Monitoring controller
 * Display messages from all devices received on bus
 */
angular
.module('Cleep')
.controller('monitoringController', ['monitoringService', '$mdSidenav', function(monitoringService, $mdSidenav) {
    var self = this;
    self.monitoring = monitoringService;
    self.selectedMessage = null;

    self.buildToggler = function(navID) {
        return function(message) {
            self.selectedMessage = message;
            $mdSidenav(navID).toggle();
        };
    }

    self.closeEventDetails = function() {
        $mdSidenav('right').close();
    }

    self.$onInit = function() {
        self.toggleEventDetails = self.buildToggler('right');
    }
}]);
