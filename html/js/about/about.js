/**
 * About controller
 */
angular
.module('Cleep')
.controller('aboutController', ['cleepdesktopInfos',
function(cleepdesktopInfos) {
    var self = this;
    self.cleepdesktopInfos = cleepdesktopInfos;
}]);
