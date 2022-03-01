angular
.module('Cleep')
.service('toastService', ['$mdToast', function($mdToast) {
    var self = this;

    self.error = function(message, duration) {
        self.toast(message, duration || 3000, 'error');
    };

    self.warning = function(message, duration) {
        self.toast(message, duration || 2000, 'warning');
    };

    self.success = function(message, duration) {
        self.toast(message, duration || 1500, 'success');
    };

    self.info = function(message, duration) {
        self.toast(message, duration || 1500, 'info');
    };

    self.toast = function(message, duration, class_) {
        $mdToast.show(
            $mdToast.simple()
                .textContent(message)
                .toastClass(class_ || 'info')
                .position('bottom left')
                .hideDelay(duration)
        );
    };

    self.loading = function(message, class_) {
        $mdToast.show({
            template: '<md-toast><span class="md-toast-text">'+message+'</span><md-progress-circular md-mode="indeterminate" md-diameter="30" class="md-accent"></md-progress-circular></md-toast>',
            position: 'bottom left',
            toastClass: class_ || 'info',
            hideDelay: 0
        });
    };

    self.hide = function() {
        $mdToast.hide();
    };
}]);
