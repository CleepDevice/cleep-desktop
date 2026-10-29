angular
.module('Cleep')
.service('devicesService', ['electronService', 'loggerService', 'ipcLifecycle',
function(electron, logger, ipcLifecycle) {
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

    self.addIpcs = function() {
        self._unsubscribers.push(
            electron.devices.onUpdated(self.onDevicesUpdated.bind(self)),
            electron.devices.onAuthUpdated(self.onDevicesAuthUpdated.bind(self)),
            electron.devices.onBusConnected(self.onMessageBusConnected.bind(self)),
            electron.devices.onBusError(self.onMessageBusError.bind(self)),
            electron.devices.onBusUpdating(self.onMessageBusUpdating.bind(self)),
            // Lifecycle events also flip online in the list (belt-and-suspenders with devices-updated).
            electron.devices.onMessage(self.onDevicesLifecycleMessage.bind(self)),
        );
    };

    ipcLifecycle.attach(self, self.addIpcs, function() {
        // Pull current state after listeners are registered (covers startup + html hot-reload).
        electron.devices.getUiState()
            .then((state) => {
                self.onDevicesUpdated(null, state.devices || []);
                self.onMessageBusConnected(null, Boolean(state.busConnected));
            })
            .catch((error) => {
                logger.error('Unable to load devices ui state', error);
            });
    });

    self.onDevicesUpdated = function(_event, devices) {
        // Preserve hasAuthStored across peer updates when main omitted the flag.
        var previousByUuid = {};
        self.devices.forEach((device) => {
            previousByUuid[device.uuid] = device;
        });

        self.devices = devices || [];

        self.devices.forEach((device) => {
            if (device.hasAuthStored === undefined) {
                var previous = previousByUuid[device.uuid];
                device.hasAuthStored = previous ? Boolean(previous.hasAuthStored) : false;
            }
            device.url = (device.ssl ? 'https://' : 'http://') + device.ip + ':' + device.port;
        });
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

    self.onDevicesLifecycleMessage = function(_event, payload) {
        var eventName = payload && payload.message && payload.message.event;
        if (eventName !== 'device.connected' && eventName !== 'device.disconnected') {
            return;
        }

        var peer = payload.peerInfos || {};
        var foundDevice = self.findDevice(peer.uuid, peer.ip);
        if (!foundDevice) {
            logger.debug('Lifecycle event for unknown device', { eventName, peer });
            return;
        }

        foundDevice.online = eventName === 'device.connected';
        logger.debug('Device availability updated from lifecycle event', {
            uuid: foundDevice.uuid,
            online: foundDevice.online,
            eventName: eventName,
        });
    };

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
        return electron.devices.deleteDevice(device.uuid);
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
    };

    self.hasRemoteAccess = function(device) {
        return Boolean(device && device.remoteaccess && Object.keys(device.remoteaccess).length > 0);
    };

    /** Prefer ngrok when several tunnels exist; otherwise first entry. */
    self.getPrimaryRemoteUrl = function(device) {
        if (!self.hasRemoteAccess(device)) {
            return null;
        }
        if (device.remoteaccess.ngrok) {
            return device.remoteaccess.ngrok;
        }
        var keys = Object.keys(device.remoteaccess);
        return device.remoteaccess[keys[0]] || null;
    };

    self.getRemoteAccessApps = function(device) {
        if (!self.hasRemoteAccess(device)) {
            return '';
        }
        return Object.keys(device.remoteaccess).join(', ');
    };

    /** True when at least one remote-access app has a cached refresh descriptor. */
    self.canRefreshRemoteUrl = function(device) {
        if (!device || !device.remoteRefresh) {
            return false;
        }
        return Object.keys(device.remoteRefresh).some(function(app) {
            var entry = device.remoteRefresh[app];
            return Boolean(entry && entry.supported);
        });
    };

    /** Device that publishes a public HTTPS remoteaccess URL (house gateway). */
    self.findGatewayDevice = function() {
        return self.devices.find(function(device) {
            return Boolean(self.getPrimaryRemoteUrl(device));
        }) || null;
    };

    /**
     * Resolve the URL to open for a device:
     * - LAN when online
     * - else gateway public URL (Desktop injects Target header)
     */
    self.resolveOpenUrl = function(device) {
        if (!device) {
            return null;
        }
        if (device.online && device.ip) {
            return device.url || ((device.ssl ? 'https://' : 'http://') + device.ip + ':' + device.port);
        }
        var gateway = self.findGatewayDevice();
        if (!gateway) {
            return null;
        }
        return self.getPrimaryRemoteUrl(gateway);
    };

    /** Via gateway when offline but a public gateway URL exists. */
    self.isGatewayAccess = function(device) {
        return Boolean(device && !device.online && self.findGatewayDevice() && self.resolveOpenUrl(device));
    };

}]);
