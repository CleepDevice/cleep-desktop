/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.service('devicesService', ['electronService', 'loggerService',
function(electron, logger) {
    var self = this;
    self.devices = [];
    // connected by default to not display startup connection
    self.isMessageBusConnected = false;
    self.messageBusError = '';
    self.messageBusUpdating = false;
    self.selectedDeviceUuid = null;

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
        Object.assign(self.devices, devices);

        // add missing custom fields
        self.devices.forEach((device) => {
            if (device['hasAuthStored'] === undefined) {
                device.hasAuthStored = false;
            }
        })

        // workaround: sometimes ui doesn't catch connected event and bus stays in connecting state
        self.isMessageBusConnected = true;

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
        self.isMessageBusConnected = connected;
        self.messageBusError = '';
    }

    self.onMessageBusError = function(_event, error) {
        self.isMessageBusConnected = false;
        self.messageBusError = error;
    }

    self.onMessageBusUpdating = function(_event, updating) {
        self.messageBusUpdating = updating;
    }

    self.selectDevice = function(selectedDeviceUuid) {
        self.selectedDeviceUuid = selectedDeviceUuid;
    };

    self.deleteDevice = function(device) {
        return electron.sendReturn('devices-delete-device', device.uuid)
            .then((response) => {
                if (response.error) {
                    return Promise.reject(response.error);
                }
            });
    };

}]);
