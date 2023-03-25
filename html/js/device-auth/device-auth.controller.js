/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.controller('deviceAuthController', ['loggerService', 'electronService', '$stateParams', '$state', 'devicesService',
function(logger, electron, $stateParams, $state) {
    var self = this;
    logger.debug("deviceAuthController stateParams", $stateParams);

    self.hostname = $stateParams.hostname;
    self.url = $stateParams.url;
    self.deviceUuid = $stateParams.deviceUuid;
    self.errorCode = $stateParams.errorCode;
    self.account = null;
    self.password = null;

    self.login = function() {
        const params = {
            url: self.url,
            account: self.account,
            password: self.password,
            deviceUuid: self.deviceUuid
        };

        electron.sendReturn('update-device-auth', params)
            .then(() => {
                const paramsDevice = {
                    url: self.url,
                    hostname: self.hostname,
                    deviceUuid: self.deviceUuid,
                    auth: true,
                };
                $state.go('device', paramsDevice);
            })
    };
}]);
