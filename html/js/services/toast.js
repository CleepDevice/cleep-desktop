var toastService = function($mdToast) {
    var self = this;

    /**
     * Error message
     * @param message: message to display
     * @param duration: message duration
     */
    self.error = function(message, duration)
    {
        if( duration===undefined )
            duration = 3000;
        self.__toast(message, duration, 'error');
    };

    /**
     * Warning message
     * @param message: message to display
     * @param duration: message duration
     */
    self.warning = function(message, duration)
    {
        if( duration===undefined )
            duration = 2000;
        self.__toast(message, duration, 'warning');
    };

    /**
     * Success message
     * @param message: message to display
     * @param duration: message duration
     */
    self.success = function(message, duration)
    {
        if( duration===undefined )
            duration = 1500;
        self.__toast(message, duration, 'success');
    };

    /**
     * Info message
     * @param message: message to display
     * @param duration: message duration
     */
    self.info = function(message, duration)
    {
        if( duration===undefined )
            duration = 1500;
        self.__toast(message, duration, 'info');
    };

    /**
     * Toast message (internal use)
     * @param message: message to display
     * @param duration: message duration
     * @param class_: bubble class (success, error, warning or info). If not specified setted to info
     */
    self.__toast = function(message, duration, class_) {
        $mdToast.show(
            $mdToast.simple()
                .textContent(message)
                .toastClass(class_)
                .position('bottom left')
                .hideDelay(duration)
        );
    };

    /**
     * Loading message. Add a spinner near message
     * @param message: message to display
     * @param class_: bubble class (success, error, warning or info). If not specified setted to info
     */
    self.loading = function(message, class_) {
        if( angular.isUndefined(class_) )
        {
            class_ = 'info';
        }

        $mdToast.show({
            template: '<md-toast><span class="md-toast-text">'+message+'</span><md-progress-circular md-mode="indeterminate" md-diameter="30" class="md-accent"></md-progress-circular></md-toast>',
            position: 'bottom left',
            toastClass: class_,
            hideDelay: 0
        });
    };

    /**
     * Hide current toast message
     * Useful to hide loading message
     */
    self.hide = function() {
        $mdToast.hide();
    };
};
    
var Cleep = angular.module('Cleep');
Cleep.service('toastService', ['$mdToast', toastService]);

