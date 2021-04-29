/**
 * Devices service handles all devices
 */
angular
.module('Cleep')
.service('devicesService', ['$rootScope', 'cleepService', 'logger',
function($rootScope, cleepService, logger) {
    var self = this;
    self.loading = true;
    self.devices = [];
    self.unconfigured = 0;
    self.configured = 0;
    // connected by default to not display network problem
    self.isConnected = true;

    // smart devices sync, it updates existing devices, adds new ones and removes deleted ones
    self.__syncDevices = function(devices, removedDevice) {
        if (devices) {
            // add and update devices
            var found = false;
            for (var i=0; i < devices.length; i++) {
                found = false;
                for (var j=0; j < self.devices.length; j++) {
                    if (self.devices[j].uuid === devices[i].uuid) {
                        // device found
                        found = true;

                        // update device infos
                        self.devices[j].hostname = devices[i].hostname;
                        self.devices[j].ip = devices[i].ip;
                        self.devices[j].online = devices[i].online;
                        self.devices[j].port = devices[i].port;
                        self.devices[j].ssl = devices[i].ssl;
                        self.devices[j].version = devices[i].version;

                        break;
                    }
                }

                // add new device
                if (!found) {
                    // save entry
                    self.devices.push(devices[i]);
                }
            }
        }
    };

    // Search existing device in current devices list following this criteria:
    //  * in case of device connection, uuid will be the same 
    //  * in case of new device installation, uuid is different but mac address will be the same if cleep reinstalled
    //  * in case of different network adapter (wired->wifi, new wifi adapter), device may have one of existing mac address
    self.__searchDevice = function(search) {
        self.devices.forEach((current) => {
            // check uuid
            if (current.uuid === search.uuid) {
                logger.debug('Found device by its uuid');
                return current;
            }

            // check mac addresses
            if (search.macs.some((mac) => current.macs.includes(mac))) {
                logger.debug('Found device by its mac address');
                return current;
            }
        })
    }

    // update devices list
    self.__updateDevices = function(responseData, removedDevice) {
        // sync devices
        self.__syncDevices(responseData.devices, removedDevice);

        // sort devices list
        self.devices.sort((a, b) => {
            var lowerA = a.hostname.toLowerCase();
            var lowerB = b.hostname.toLowerCase();
            if (lowerA>lowerB) {
                return 1;
            }
            if (lowerA<lowerB) {
                return -1;
            }
            return 0;
        });

        // update some controller members value
        self.unconfigured = responseData.unconfigured;
        self.configured = self.devices.length - self.unconfigured;
        self.loading = false;
    };

    // select device in devices panel
    self.selectDevice = function(selectedDevice) {
        for( var i=0; i<self.devices.length; i++ ) {
            if( selectedDevice && self.devices[i].ip===selectedDevice.ip ) {
                self.devices[i].selected = true;
            } else {
                self.devices[i].selected = false;
            }
        }
    };

    // get devices
    self.getDevices = function() {
        return cleepService.sendCommand('get_devices', 'devices')
            .then((resp) => {
                self.__updateDevices(resp.data);
            });
    };

    // delete device
    self.deleteDevice = function(device) {
        return cleepService.sendCommand('delete_device', 'devices', {
                'peer_uuid': device.uuid,
            })
            .then((resp) => {
                self.__updateDevices(resp.data, device);
            });
    };

    // watch for devices event to refresh devices list
    $rootScope.$on('devices', function(_event, data) {
        self.__updateDevices(data);
    });

    // watch for network event
    $rootScope.$on('network', function(_event, data) {
        self.isConnected = data.connected;
    });

}]);
