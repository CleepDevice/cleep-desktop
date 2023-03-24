/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.controller('deviceAuthController', ['loggerService', 'electronService', '$stateParams', '$rootScope',
function(logger, electron, $stateParams, $rootScope) {
    var self = this;
    logger.debug("stateParams", $stateParams);

    self.hostname = $stateParams.hostname;
    self.url = $stateParams.url;
    self.deviceUuid = $stateParams.deviceUuid;
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
                $rootScope.$broadcast('open-page', 'device', { url: self.url, hostname: self.hostname });
            })
    };
}]);
