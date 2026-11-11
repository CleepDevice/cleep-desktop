/**
 * ModalService displays your controller (and its template) into a modal
 * Charge in you to have proper template content based on examples at https://material.angularjs.org/HEAD/demo/dialog
 * 
 * To close the modal from your controller, inject "closeModal" service function in your controller
 */
angular
.module('Cleep')
.service('modalService', ['$mdDialog', '$transitions', function($mdDialog, $routerTransitions) {
    var self = this;
    self.blockingOpen = false;

    /**
     * open modal
     * @param controllerName: name of controller to inject into modal
     * @param templateUrl: associated controller template
     * @param data: data to pass to modal controller
     * @param resolve: async modal data (promise)
     * @param options: optional { blocking: true } — no Esc / route dismiss
     * @service closeModal: inject this service in your controller to close modal
     */
    self.open = function(controllerName, templateUrl, data, resolve, options) {
        var blocking = Boolean(options && options.blocking);
        if (blocking) {
            self.blockingOpen = true;
        }
        return $mdDialog.show({
            controller: controllerName,
            controllerAs: 'ctl',
            locals: {
                closeModal: self.closeModal,
                modalData: data,
            },
            resolve: resolve,
            templateUrl: templateUrl,
            parent: angular.element(document.body),
            bindToController: true,
            clickOutsideToClose: false,
            escapeToClose: !blocking,
            fullscreen: true
        }).finally(function() {
            if (blocking) {
                self.blockingOpen = false;
            }
        });
    };

    // handle router transitions to close modal if user change main page
    $routerTransitions.onStart({}, function() {
        if (self.blockingOpen) {
            return false;
        }
        $mdDialog.cancel();
    });

    self.closeModal = function(result) {
        if (result === undefined || result === null) {
            $mdDialog.cancel();
            return;
        }
        $mdDialog.hide(result);
    };
}]);
