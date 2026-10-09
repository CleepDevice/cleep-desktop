angular
.module('Cleep')
.controller('deviceErrorController', ['$stateParams',
function($stateParams) {
    var self = this;
    self.hostname = $stateParams.hostname || "Unknown device";
}]);
