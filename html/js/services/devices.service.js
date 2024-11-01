/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.service('devicesService', ['electronService', 'loggerService',
function(electron, logger) {
    var self = this;
    self.devices = [];
    self.messageBusError = '';
    self.selectedDeviceUuid = null;

    // status:
    // - CONNECTED: when connected to cleepbus
    // - CONNECTING: when connecting
    // - UPDATING: when cleepbus is installing/updating
    // - ERROR: when error occured
    // connected at startup to not display loader
    self.busStatus = 'CONNECTED';

    self.init = function() {
        self.addIpcs();
    };
 
    self.addIpcs = function() {
        electron.on('devices-updated', self.onDevicesUpdated.bind(self));
        electron.on('device-auth-updated', self.onDevicesAuthUpdated.bind(self));
        electron.on('devices-message-bus-connected', self.onMessageBusConnected.bind(self));
        electron.on('devices-message-bus-error', self.onMessageBusError.bind(self));
        electron.on('devices-message-bus-updating', self.onMessageBusUpdating.bind(self));
    };

    self.onDevicesUpdated = function(_event, devices) {
        // sync all devices
        self.devices = devices;

        // add custom fields for frontend usage
        self.devices.forEach((device) => {
            if (device['hasAuthStored'] === undefined) {
                device.hasAuthStored = false;
            }
            device.url = (device.ssl ? 'https://' : 'http://') + device.ip + ':' + device.port;
        })

        // workaround: sometimes ui doesn't catch connected event and bus stays in connecting state
        self.busStatus = 'CONNECTED';

        // remove obsolete devices
        var devicesUuids = devices.map((device) => device.uuid);
        const deviceIndexesToDelete = self.devices.map(
            (device, index) => devicesUuids.find((deviceUuid) => deviceUuid === device.uuid) ? undefined : index
        );
        for (const index of deviceIndexesToDelete.reverse()) {
            if (index === undefined) continue;
            self.devices.splice(index, 1);
        }
    };

    self.onDevicesAuthUpdated = function(_event, auth) {
        var foundDevice = self.devices.find((device) => device.uuid === auth.deviceUuid);
        if (!foundDevice) {
            logger.warn('Device not found during auth update', auth);
            return;
        }

        logger.debug('Device has auth updated', { foundDevice, hasAuthStored: auth.hasAuthStored });
        foundDevice.hasAuthStored = auth.hasAuthStored;
    }

    self.onMessageBusConnected = function(_event, connected) {
        if (self.busStatus === 'ERROR') {
            // do not overwrite error status
            return;
        }
        self.busStatus = connected ? 'CONNECTED' : 'CONNECTING';
        self.messageBusError = '';
    }

    self.onMessageBusError = function(_event, error) {
        self.busStatus = 'ERROR';
        self.messageBusError = error;
    }

    self.onMessageBusUpdating = function(_event, updating) {
        self.busStatus = updating ? 'UPDATING' : 'CONNECTING';
    }

    self.selectDevice = function(selectedDeviceUuid) {
        self.selectedDeviceUuid = selectedDeviceUuid;
    };

    self.getSelectedDevice = function() {
        return self.findDevice(self.selectedDeviceUuid);
    }

    self.deleteDevice = function(device) {
        return electron.sendReturn('devices-delete-device', device.uuid)
            .then((response) => {
                if (response.error) {
                    return Promise.reject(response.error);
                }
            });
    };

    self.findDevice = function(deviceUuid, deviceIp) {
        let device;
        
        // search by uuid
        if (deviceUuid) {
            device = self.devices.find((device) => device.uuid === deviceUuid);
        }

        // search by ip if necessary
        if (!device && deviceIp) {
            device = self.devices.find((device) => device.ip === deviceIp);
        }

        return device
    }

}]);
