/**
 * Confirm dialog service
 * Used to open a material confirm dialog
 */
var confirmService = function($mdDialog) {
    var self = this;

    /**
     * Confirm dialog helper
     * @param title: dialog title
     * @param message: dialog message
     * @param okLabel: ok message (default 'Ok')
     * @param cancelLabel: ok message (default 'Cancel')
     */
    self.open = function(title, message, okLabel, cancelLabel, container) {
        //TODO useful ?
        //container
        var container_ = angular.element(document.body);
        if( !angular.isUndefined(container) ) {
            if( !container.startsWith('#') ) {
                container = '#' + container;
            }
            _container = angular.element(document.querySelector(container));
        }

        //check strings
        if( angular.isUndefined(okLabel) || okLabel===null ) {
            okLabel = 'Ok';
        }
        if( angular.isUndefined(cancelLabel) || cancelLabel===null ) {
            cancelLabel = 'Cancel';
        }

        var confirm_ = $mdDialog.confirm()
            .title(title)
            //.textContent(message)
            .htmlContent(message)
            .ariaLabel('Confirm dialog')
            .ok(okLabel)
            .cancel(cancelLabel);

        return $mdDialog.show(confirm_);
    };
};
    
var Cleep = angular.module('Cleep');
Cleep.service('confirmService', ['$mdDialog', confirmService]);

