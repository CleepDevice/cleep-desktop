angular
.module('Cleep')
.controller('aboutController', [function() {
    var self = this;

    self.openUrl = function(url) {
        window.open(url, '_blank');
    };
}]);
