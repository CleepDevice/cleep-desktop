angular
.module('Cleep')
.service('devicesService', ['electronService',
function(electron) {
    var self = this;
    self.devices = [];
    // connected by default to not display startup connection
    self.isMessageBusConnected = false;
    self.messageBusError = '';
    self.selectedDeviceUuid = null;

    self.init = function() {
        self.addIpcs();
    };
 
    self.addIpcs = function() {
        electron.on('devices-updated', self.onDevicesUpdated.bind(self));
        electron.on('devices-message-bus-connected', self.onMessageBusConnected.bind(self));
        electron.on('devices-message-bus-error', self.onMessageBusError.bind(self));
    };

    self.onDevicesUpdated = function(_event, devices) {
        // sync all devices
        Object.assign(self.devices, devices);

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

    self.onMessageBusConnected = function(_event, connected) {
        self.isMessageBusConnected = connected;
        self.messageBusError = '';
    }

    self.onMessageBusError = function(_event, error) {
        self.isMessageBusConnected = false;
        self.messageBusError = error;
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
