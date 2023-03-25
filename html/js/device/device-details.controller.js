/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.controller('deviceDetailsController', ['modalData', 'closeModal', function(modalData, closeModal) {
    var self = this;
    self.device = modalData;
    self.closeModal = closeModal;
    self.deviceApps = self.device.extra.apps.filter((app) => {
        return ['audio', 'cleepbus', 'network', 'parameters', 'system', 'update'].indexOf(app)===-1;
    });
    self.boardImages = {
        // model A
        '0007':   'images/raspberry-pi-1-model-a.jpg',
        '0008':   'images/raspberry-pi-1-model-a.jpg',
        '0009':   'images/raspberry-pi-1-model-a.jpg',
        // model B
        '0002':   'images/raspberry-pi-1-model-b.jpg',
        '0003':   'images/raspberry-pi-1-model-b.jpg',
        '0004':   'images/raspberry-pi-1-model-b.jpg',
        '0005':   'images/raspberry-pi-1-model-b.jpg',
        '0006':   'images/raspberry-pi-1-model-b.jpg',
        '000d':   'images/raspberry-pi-1-model-b.jpg',
        '000e':   'images/raspberry-pi-1-model-b.jpg',
        '000f':   'images/raspberry-pi-1-model-b.jpg',
        // model A+
        '0012':   'images/raspberry-pi-1-model-a+.jpg',
        '0015':   'images/raspberry-pi-1-model-a+.jpg',
        '900021': 'images/raspberry-pi-1-model-a+.jpg',
        // model B+
        '0010':   'images/raspberry-pi-1-model-b+.jpg',
        '0013':   'images/raspberry-pi-1-model-b+.jpg',
        '900032': 'images/raspberry-pi-1-model-b+.jpg',
        // 2 Model B
        'a01040': 'images/raspberry-pi-2-model-b.jpg',
        'a01041': 'images/raspberry-pi-2-model-b.jpg',
        'a21041': 'images/raspberry-pi-2-model-b.jpg',
        'a22042': 'images/raspberry-pi-2-model-b.jpg',
        // 3 Model B
        'a02082': 'images/raspberry-pi-3-model-b.jpg',
        'a22082': 'images/raspberry-pi-3-model-b.jpg',
        'a32082': 'images/raspberry-pi-3-model-b.jpg',
        // 3 Model B+
        'a020d3': 'images/raspberry-pi-3-model-b+.jpg',
        // 3 Model A+
        '9020e0': 'images/raspberry-pi-3-model-a+.jpg',
        // 4 Model B
        'a03111': 'images/raspberry-pi-3-model-b.jpg',
        'b03111': 'images/raspberry-pi-3-model-b.jpg',
        'c03111': 'images/raspberry-pi-3-model-b.jpg',
        // Zero
        '900092': 'images/raspberry-pi-zero.jpg',
        '900093': 'images/raspberry-pi-zero.jpg',
        '920093': 'images/raspberry-pi-zero.jpg',
        // Zero W
        '9000c1': 'images/raspberry-pi-zero-w.jpg',
        // Compute Module 1
        '0011':   'images/raspberry-pi-compute-module-1.jpg',
        '0014':   'images/raspberry-pi-compute-module-1.jpg',
        // Compute Module 3
        'a020a0': 'images/raspberry-pi-compute-module-3.jpg',
    }
    self.boardImg = self.boardImages[self.device.extra['hwrevision']];
}]);
