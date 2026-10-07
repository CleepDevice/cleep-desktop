/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ui.router', 'ngSanitize', 'ngWebSocket']);

Cleep
.controller('cleepController', ['$scope', '$rootScope', '$state', 'tasksPanelService', 'modalService',
                                '$timeout', '$transitions', 'settingsService', 'devicesService',
                                'updateService', 'installService', 'monitoringService', 'downloadService',
                                'electronService',
function($scope, $rootScope, $state, tasksPanelService, modalService, $timeout, $transitions, settings,
        devicesService, updateService, installService, monitoringService, downloadService, electron) {
    var self = this;
    self.taskRestartRequiredPanelId = null;
    self.selectedToolbarItem = null;
    self.toolbarCollapsed = true;
    self._unsubscribers = [];

    self.$onInit = function() {
        // init services (idempotent — safe if called again)
        downloadService.init();
        monitoringService.init();
        updateService.init();
        installService.init();
        devicesService.init();

        self._unsubscribers.push(
            electron.app.onOpenPage(function(_event, data) {
                const { page, ...params } = data;
                self.openPage(page, params);
            }),
            electron.app.onAuthError(function(_event, data) {
                const foundDevice = devicesService.getSelectedDevice() || devicesService.findDevice(null, data.ip);

                if (foundDevice) {
                    const params = {
                        url: foundDevice.url,
                        hostname: foundDevice.hostname,
                        deviceUuid: foundDevice.uuid,
                        errorCode: data.errorCode || 'UNKNOWN_ERROR',
                    };
                    $state.go('deviceAuth', params);
                } else {
                    $state.go('deviceError', { hostname: data.ip });
                }
            }),
            electron.app.onOpenModal(function(_event, args) {
                self.openModal(args.controller, args.template, args.data);
            }),
        );

        // first run? open application help
        settings.get('cleep.firstrun')
            .then((firstRun) => {
                if (!firstRun) return;
                $timeout(() => {
                    self.openModal('helpDialogController', 'js/help/help-dialog.html');
                }, 500);
                settings.set('cleep.firstrun', false);
            });
    };

    $scope.$on('$destroy', function() {
        self._unsubscribers.forEach(function(unsubscribe) {
            unsubscribe();
        });
        self._unsubscribers = [];
        downloadService.destroy();
        monitoringService.destroy();
        updateService.destroy();
        installService.destroy();
        devicesService.destroy();
    });

    // open page
    self.openPage = function(page, params) {
        devicesService.selectDevice(null);
        $state.go(page, params || {});
    };

    $rootScope.$on('open-page', (_event, data) => {
        const { page, ...params } = data;
        self.openPage(page, params);
    });

    // open modal
    self.openModal = function(controllerName, templateUrl, data) {
        modalService.open(controllerName, templateUrl, data || {});
    };

    // toolbar
    $transitions.onEnter({}, (_trans, state) => {
        self.selectedToolbarItem = state.name;
    });

    self.toggleToolbar = function() {
        self.toolbarCollapsed = !self.toolbarCollapsed;
    };

    // application restart
    $rootScope.$on('restartrequired', () => {
        if (!self.taskRestartRequiredPanelId) {
            self.taskRestartRequiredPanelId = tasksPanelService.addPanel(
                'Please restart application to apply changes.', 
                {
                    onAction: self.restartApplication,
                    tooltip: 'Restart now!',
                    icon: 'restart'
                },
                {
                    onClose: self.onCloseRestartRequiredTaskPanel,
                    disabled: false
                },
                false
            );
        }
    });

    $rootScope.$on('restart', function(_event, _data) {
        self.restartApplication();
    });

    self.onCloseRestartRequiredTaskPanel = function() {
        tasksPanelService.removePanel(self.taskRestartRequiredPanelId);
        self.taskRestartRequiredPanelId = null;
    };

    self.restartApplication = function() {
        electron.updater.quitAndInstall();
    };
}]);
