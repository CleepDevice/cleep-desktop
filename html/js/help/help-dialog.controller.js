angular
.module('Cleep')
.controller('helpDialogController', ['closeModal',
function(closeModal) {
    var self = this;
    self.closeModal = closeModal;
}]);
 