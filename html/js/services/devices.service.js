angular
.module('Cleep')
.service('devicesService', ['$rootScope', 'cleepService', 'loggerService',
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
            for (var i=0; i < devices.length; i++) {
                var found = self.__searchDevice(devices[i]);
                if (found) {
                    // update existing device
                    found.uuid = devices[i].uuid;
                    found.ident = devices[i].ident;
                    found.hostname = devices[i].hostname;
                    found.ip = devices[i].ip;
                    found.online = devices[i].online;
                    found.port = devices[i].port;
                    found.ssl = devices[i].ssl;
                    found.version = devices[i].version;
                    Object.assign(found.extra, devices[i].extra);
                } else {
                    // add new device
                    self.devices.push(devices[i]);
                }
            }
        }

        // remove device
        if (removedDevice) {
            var indexToDelete = -1;
            for (var i=0; i < self.devices.length; i++) {
                if (self.devices[i].uuid === removedDevice.uuid) {
                    indexToDelete = i;
                    break;
                }
            }
            if (indexToDelete >= 0) {
                self.devices.splice(i, 1);
            }
        }
    };

    // Search for existing device in current devices list following those criteria:
    //  * in case of device connection, uuid will be the same 
    //  * in case of new device installation, uuid is different but at once ont mac address should be the same
    //  * in case of different network adapter (wired->wifi, new wifi adapter), device may have one of existing mac address
    self.__searchDevice = function(search) {
        for (var current of self.devices) {
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
        }

        return null;
    }

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

    self.selectDevice = function(selectedDevice) {
        for( var i=0; i<self.devices.length; i++ ) {
            if( selectedDevice && self.devices[i].ip===selectedDevice.ip ) {
                self.devices[i].selected = true;
            } else {
                self.devices[i].selected = false;
            }
        }
    };

    self.getDevices = function() {
        return cleepService.sendCommand('get_devices', 'devices')
            .then((resp) => {
                self.__updateDevices(resp.data);
            });
    };

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

    $rootScope.$on('network', function(_event, data) {
        self.isConnected = data.connected;
    });

}]);
