/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
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

    self.isUnsecured = function() {
        if (installService.wifiInfo.hasWifi && self.network === 1 && self.selectedWifi) {
            return String(self.selectedWifi.security || '').toUpperCase() === 'UNSECURED';
        }
        return self.wifiNetworkSecurity === 'unsecured';
    };

    self.disableSaveButton = function() {
        if (self.network === 1) {
            // user wants to connect to available wifi network
            if (!installService.wifiInfo.hasWifi && !self.wifiNetworkName ) {
                return true;
            } else if (installService.wifiInfo.hasWifi && (!self.selectedWifi || !self.selectedWifi.ssid)) {
                return true;
            } else if (!self.isUnsecured() && !self.wifiPassword) {
                return true;
            }
        }

        if (self.network === 2) {
            // user wants to connect to hidden network
            if (!self.wifiNetworkName) {
                return true;
            } else if (!self.isUnsecured() && !self.wifiPassword) {
                return true;
            }
        }

        return false;
    };

    self.selectNetwork = function() {
        if (self.selectedWifi) {
            self.closeModal({
                network: self.selectedWifi.ssid,
                security: String(self.selectedWifi.security || '').toLowerCase(),
                password: self.isUnsecured() ? '' : self.wifiPassword,
                hidden: self.network === 2,
            });
        } else {
            self.closeModal({
                network: self.wifiNetworkName,
                security: self.wifiNetworkSecurity,
                password: self.isUnsecured() ? '' : self.wifiPassword,
                hidden: self.network === 2,
            });
        }
    };
}]);
