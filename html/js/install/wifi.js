var Cleep = angular.module('Cleep')

/**
 * Wifi controller
 */
var wifiController = function(closeModal, installService, modalData)
{
    var self = this;
    self.closeModal = closeModal;
    self.config = installService.wifi;
    self.selectedWifi = null;
    self.wifiPassword = null;
    self.wifiNetworkName = '';
    self.wifiNetworkEncryption = 'wpa2';
    self.showPassword = false;
    self.wifiChoice = modalData.wifiChoice;

    //refresh wifi networks
    self.refreshWifiNetworks = function() {
        return installService.refreshWifiNetworks();
    };

    self.disableSaveButton = function() {
        if( self.wifiChoice==1 ) {
            //user wants to connect to available wifi network
            if( !self.config.adapter && !self.wifiNetworkName ) {
                return true;

            } else if( self.config.adapter && (!self.selectedWifi || !self.selectedWifi.network) ) {
                return true;

            } else if( self.wifiNetworkEncryption!='unsecured' && !self.wifiPassword ) {
                return true;
            }
        }

        if( self.wifiChoice==2 ) {
            //user wants to connect to hidden network
            if( !self.wifiNetworkName ) {
                //toast.error('Please set wifi network name');
                return true;

            } else if( self.wifiNetworkEncryption!='unsecured' && !self.wifiPassword ) {
                //toast.error('Please fill wifi network password');
                return true;
            }
        }

        return false;
    };

    //save config
    self.save = function() {
        if( self.selectedWifi ) {
            self.closeModal({
                network: self.selectedWifi.network,
                encryption: self.selectedWifi.encryption,
                password: self.wifiPassword,
                hidden: (self.wifiChoice===2 ? true : false)
            });
        } else {
            self.closeModal({
                network: self.wifiNetworkName,
                encryption: self.wifiNetworkEncryption,
                password: self.wifiPassword,
                hidden: (self.wifiChoice===2 ? true : false)
            });
        }
    };
    
};
Cleep.controller('wifiController', ['closeModal', 'installService', 'modalData', wifiController]);
