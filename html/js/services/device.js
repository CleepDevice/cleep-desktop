/**
 * Device service handles selected device
 */
angular
.module('Cleep')
.service('deviceService', ['$rootScope', 'cleepService', 
function() {
    var self = this;
    self.loading = true;    
}]);
