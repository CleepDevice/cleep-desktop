var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ui.router', 'ngSanitize', 'ngWebSocket']);

/**
 * Empty controller
 */
Cleep.controller('emptyController', [function() {
    var self = this;
}]);

/**
 * Empty dialog controller
 * Add minimal stuff to handle properly dialog
 */
Cleep.controller('emptyDialogController', ['closeModal',
function(closeModal) {
    var self = this;
    self.closeModal = closeModal;
}]);

/**
 * Cleep controller
 */
Cleep
.controller('cleepController', ['$rootScope', '$state', 'cleepService', 'tasksPanelService', 'modalService',
                                '$timeout', '$transitions', 'settingsService', 'loggerService', 'devicesService',
                                'updateService', 'installService', 'monitoringService', 'downloadService',
                                'electronService',
function($rootScope, $state, cleepService, tasksPanelService, modalService, $timeout, $transitions, settings,
         logger, devicesService, updateService, installService, monitoringService, downloadService, electron) {

    var self = this;
    self.taskRestartRequiredPanelId = null;
    self.taskFlashPanelClosed = false;
    self.selectedToolbarItem = null;
    self.toolbarCollapsed = true;

    self.$onInit = function() {
        // init websocket asap
        settings.get('remote.rpcport')
            .then((port) => {
                return cleepService.connectWebSocket(port);
            })
            .then(() => {
                logger.info('Websocket connected, launch angular application');
                
                // init services
                downloadService.init();
                monitoringService.init();
                devicesService.getDevices();
                updateService.init();
                installService.init();

                // first run? open application help
                settings.get('cleep.firstrun')
                    .then((firstRun) => {
                        if (!firstRun) return;
                        $timeout(() => {
                            self.openModal('emptyDialogController', 'js/help/help-dialog.html');
                        }, 500);
                        settings.set('cleep.firstrun', false);
                    });
            });
    };

    // open page
    self.openPage = function(page) {
        devicesService.selectDevice(null);
        $state.go(page);
    };

    electron.on('open-page', function(_event, page) {
        self.openPage(page);
    });

    $rootScope.$on('open-page', (_event, page) => {
        self.openPage(page);
    })

    // open modal
    self.openModal = function(controllerName, templateUrl, data) {
        modalService.open(controllerName, templateUrl, data || {});
    };

    electron.on('open-modal', function(_event, args) {
        self.openModal(args.controller, args.template, args.data);
    });

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

    self.onCloseRestartRequiredPanel = function() {
        tasksPanelService.removePanel(self.taskRestartRequiredPanelId);
        self.taskRestartRequiredPanelId = null;
    };

    self.restartApplication = function() {
        electron.send('updater-quit-and-install');
    };

    // disable/enable application quit when process is running (like install process)
    $rootScope.$on('disablequit', function(_event, _data) {
        electron.send('allow-quit', false);
    });
    $rootScope.$on('enablequit', function(_event, _data) {
        electron.send('allow-quit', true);
    });
}]);
