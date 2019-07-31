var Cleep = angular.module('Cleep')

/**
 * Device details controller
 */
var deviceDetailsController = function(modalData, closeModal)
{
    var self = this;
    self.device = modalData;
    self.closeModal = closeModal;
    self.deviceApps = self.device.apps.split(',').filter((app) => {
        return ['audio', 'cleepbus', 'network', 'parameters', 'system'].indexOf(app)===-1;
    });
};
Cleep.controller('deviceDetailsController', ['modalData', 'closeModal', deviceDetailsController]);
