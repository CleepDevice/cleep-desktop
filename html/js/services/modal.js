/**
 * ModalService displays your controller (and its template) into a modal
 * Charge in you to have proper template content based on examples at https://material.angularjs.org/HEAD/demo/dialog
 * 
 * To close the modal from your controller, inject "closeModal" service function in your controller
 */

var modalService = function($mdPanel, $mdDialog) {
    var self = this;

    //open modal
    //@param controllerName: name of controller to inject into modal
    //@param templateUrl: associated controller template
    //@service closeModal: inject this service in your controller to close modal
    self.open = function(controllerName, templateUrl) {
        $mdDialog.show({
            controller: controllerName,
            controllerAs: 'ctl',
            locals: {
                closeModal: function() {
                    $mdDialog.cancel();
                }
            },
            templateUrl: templateUrl,
            parent: angular.element(document.body),
            clickOutsideToClose:false,
            fullscreen: true
        });
    };

};
    
var Cleep = angular.module('Cleep');
Cleep.service('modalService', ['$mdPanel', '$mdDialog', modalService]);
