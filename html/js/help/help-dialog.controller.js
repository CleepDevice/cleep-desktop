/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.controller('helpDialogController', ['closeModal',
function(closeModal) {
    var self = this;
    self.closeModal = closeModal;
}]);
 