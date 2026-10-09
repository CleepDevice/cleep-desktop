angular
.module('Cleep')
.controller('monitoringController', ['monitoringService', '$mdSidenav', function(monitoringService, $mdSidenav) {
    var self = this;
    self.monitoring = monitoringService;
    self.selectedMessage = null;
    self.selectedRawMessage = null;

    self.buildToggler = function(navID) {
        return function(message) {
            self.selectedMessage = message;
            // Drop UI-only summary from the raw dump shown in the sidenav.
            self.selectedRawMessage = angular.copy(message);
            if (self.selectedRawMessage) {
                delete self.selectedRawMessage.summary;
            }
            $mdSidenav(navID).toggle();
        };
    };

    self.closeEventDetails = function() {
        $mdSidenav('right').close();
    };

    self.$onInit = function() {
        self.toggleEventDetails = self.buildToggler('right');
    };
}]);
