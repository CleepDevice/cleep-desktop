/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.controller('deviceErrorController', ['$stateParams',
function($stateParams) {
    var self = this;
    self.hostname = $stateParams.hostname || "Unknown device";
}]);
