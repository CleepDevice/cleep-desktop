/**
 * About controller
 */
angular
.module('Cleep')
.controller('aboutController', ['appContext',
function(appContext) {
    var self = this;
    self.appContext = appContext;
}]);
