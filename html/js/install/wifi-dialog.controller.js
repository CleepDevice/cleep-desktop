angular
.module('Cleep')
.controller('wifiController', ['closeModal', 'installService', 'modalData', 
function(closeModal, installService, modalData) {
    var self = this;
    self.closeModal = closeModal;
    self.installService = installService;
    self.selectedWifi = null;
    self.wifiPassword = null;
    self.wifiNetworkName = '';
    self.wifiNetworkSecurity = 'wpa2';
    self.showPassword = false;
    self.network = modalData.network;

    self.$onInit = function() {
        installService.hasWifi();
    };

    self.disableSaveButton = function() {
        if (self.network === 1) {
            // user wants to connect to available wifi network
            if (!installService.wifiInfo.hasWifi && !self.wifiNetworkName ) {
                return true;
            } else if (installService.wifiInfo.hasWifi && (!self.selectedWifi || !self.selectedWifi.network)) {
                return true;
            } else if(self.wifiNetworkSecurity !== 'unsecured' && !self.wifiPassword) {
                return true;
            }
        }

        if (self.network === 2) {
            // user wants to connect to hidden network
            if (!self.wifiNetworkName) {
                return true;
            } else if (self.wifiNetworkSecurity !== 'unsecured' && !self.wifiPassword) {
                return true;
            }
        }

        return false;
    };

    self.selectNetwork = function() {
        if (self.selectedWifi) {
            self.closeModal({
                network: self.selectedWifi.ssid,
                security: self.selectedWifi.security,
                password: self.wifiPassword,
                hidden: self.network === 2,
            });
        } else {
            self.closeModal({
                network: self.wifiNetworkName,
                security: self.wifiNetworkSecurity,
                password: self.wifiPassword,
                hidden: self.network === 2,
            });
        }
    };
}]);
