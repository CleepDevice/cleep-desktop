angular
.module('Cleep')
.controller('wifiController', ['$scope', 'closeModal', 'installService', 'modalData', 
function($scope, closeModal, installService, modalData) {
    var self = this;
    self.closeModal = closeModal;
    self.installService = installService;
    self.selectedWifi = null;
    self.selectedWifiSsid = '';
    self.wifiPassword = null;
    self.wifiNetworkName = '';
    self.wifiNetworkSecurity = 'wpa2';
    self.network = modalData.network;
    self.scanning = false;
    self.wifiNetworkOptions = [];
    self.securityOptions = [
        { value: 'wpa3', label: 'WPA3' },
        { value: 'wpa2', label: 'WPA2' },
        { value: 'wpa', label: 'WPA' },
        { value: 'wep', label: 'WEP' },
        { value: 'unsecured', label: 'Unsecured' },
    ];

    self.emptyScanNote = (function() {
        var platform = (window.cleep && window.cleep.platform) || '';
        var base = 'No wifi network list available. Enter SSID and password manually.';
        if (platform === 'win32') {
            return base + ' On Windows 11, enable Location access for desktop apps (Settings > Privacy & security > Location).';
        }
        if (platform === 'darwin') {
            return base + ' If prompted, allow Location access for CleepDesktop.';
        }
        if (platform === 'linux') {
            return base + ' Check that NetworkManager can list wifi networks (nmcli).';
        }
        return base;
    })();

    self.refreshWifiNetworkOptions = function() {
        self.wifiNetworkOptions = (installService.wifiInfo.networks || []).map(function(network) {
            return {
                value: network.ssid,
                label: network.ssid + ' (' + network.security + ')',
            };
        });
    };

    self.applySuggestedSsid = function() {
        if (
            self.useManualWifiFields()
            && !self.wifiNetworkName
            && installService.wifiInfo.currentSsid
        ) {
            self.wifiNetworkName = installService.wifiInfo.currentSsid;
        }
    };

    self.$onInit = function() {
        if (self.network !== 1) {
            self.applySuggestedSsid();
            return;
        }

        self.scanning = true;
        installService.hasWifi()
            .then(function(hasWifi) {
                if (!hasWifi) {
                    return;
                }
                return installService.refreshWifiNetworks(true).then(function() {
                    self.refreshWifiNetworkOptions();
                    self.applySuggestedSsid();
                });
            })
            .finally(function() {
                self.scanning = false;
                self.applySuggestedSsid();
            });
    };

    $scope.$watch(function() {
        return installService.wifiInfo.networks;
    }, function() {
        self.refreshWifiNetworkOptions();
    }, true);

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

    /** Nearby AP dropdown only when the scan actually returned networks. */
    self.useNetworkSelector = function() {
        return installService.wifiInfo.hasWifi
          && self.network === 1
          && (installService.wifiInfo.networks || []).length > 0;
    };

    self.onWifiNetworkChange = function() {
        var ssid = self.selectedWifiSsid;
        self.selectedWifi = (installService.wifiInfo.networks || []).find(function(network) {
            return network.ssid === ssid;
        }) || null;
        if (!self.selectedWifi) {
            self.selectedWifiSsid = '';
        }
    };

    self.isUnsecured = function() {
        if (self.useNetworkSelector() && self.selectedWifi) {
            return String(self.selectedWifi.security || '').toUpperCase() === 'UNSECURED';
        }
        return self.wifiNetworkSecurity === 'unsecured';
    };

    self.disableSaveButton = function() {
        if (self.scanning) {
            return true;
        }
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
