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
        installService.hasWifi().then(function(hasWifi) {
            if (hasWifi && self.network === 1) {
                installService.refreshWifiNetworks(true);
            }
        });
    };

    /** Manual SSID/security fields: no adapter, hidden network, or empty scan. */
    self.useManualWifiFields = function() {
        if (self.network === 2) {
            return true;
        }
        if (!installService.wifiInfo.hasWifi) {
            return true;
        }
        return self.network === 1
            && installService.wifiInfo.retrieved
            && installService.wifiInfo.networks.length === 0;
    };

    self.useNetworkSelector = function() {
        return installService.wifiInfo.hasWifi && self.network === 1;
    };

    self.isUnsecured = function() {
        if (self.useNetworkSelector() && self.selectedWifi) {
            return String(self.selectedWifi.security || '').toUpperCase() === 'UNSECURED';
        }
        return self.wifiNetworkSecurity === 'unsecured';
    };

    self.disableSaveButton = function() {
        if (self.network === 1) {
            var hasSelection = self.selectedWifi && self.selectedWifi.ssid;
            var hasManual = !!self.wifiNetworkName;
            if (!hasSelection && !hasManual) {
                return true;
            }
            if (!self.isUnsecured() && !self.wifiPassword) {
                return true;
            }
        }

        if (self.network === 2) {
            if (!self.wifiNetworkName) {
                return true;
            }
            if (!self.isUnsecured() && !self.wifiPassword) {
                return true;
            }
        }

        return false;
    };

    self.selectNetwork = function() {
        if (self.selectedWifi && self.selectedWifi.ssid) {
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
