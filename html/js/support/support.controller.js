angular
.module('Cleep')
.controller('supportController', [function() {
    var self = this;

    self.openUrl = function(url) {
        window.open(url, '_blank');
    };
}]);
