/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.service('confirmService', ['$mdDialog', function($mdDialog) {
    var self = this;

    /**
     * Confirm dialog helper
     * @param title: dialog title
     * @param message: dialog message
     * @param okLabel: ok message (default 'Ok')
     * @param cancelLabel: ok message (default 'Cancel')
     */
    self.open = function(title, message, okLabel, cancelLabel) {
        var confirm_ = $mdDialog.confirm()
            .title(title)
            .htmlContent(message)
            .ariaLabel('Confirm dialog')
            .ok(okLabel || 'Ok')
            .cancel(cancelLabel || 'Cancel');

        return $mdDialog.show(confirm_);
    };
}]);
