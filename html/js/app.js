let cleepUi = {
    openPage: null,
    openModal: null
};

// declare angular module
var Cleep = angular.module('Cleep', ['ngMaterial', 'ngAnimate', 'ngMessages', 'ui.router', 'ngSanitize', 'ngWebSocket']);

// inject electron values
Cleep.value('cleepUi', cleepUi);

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
.controller('cleepController', ['$rootScope', '$state', 'cleepService', 'tasksPanelService', 'modalService', 'cleepUi',
                                '$timeout', '$transitions', 'settingsService', 'loggerService', 'devicesService',
                                'updateService', 'installService', 'monitoringService', 'downloadService',
                                'electronService',
function($rootScope, $state, cleepService, tasksPanelService, modalService, cleepUi, $timeout, $transitions, settings,
         logger, devicesService, updateService, installService, monitoringService, downloadService, electron) {

    var self = this;
    self.taskFlashPanel = null;
    self.taskFlashPanelClosed = false;
    self.selectedToolbarItem = null;
    self.toolbarCollapsed = true;

    self.$onInit = function() {
        // init websocket asap
        cleepService.connectWebSocket()
        .then(function() {
            logger.info('Websocket connected, launch angular application');
            
            // init services
            downloadService.init();
            monitoringService.init();
            devicesService.getDevices();
            updateService.init();
            installService.init();

            // first run? open application help
            if (settings.get('cleep.firstrun')) {
                $timeout(() => {
                    self.openModal('emptyDialogController', 'js/help/help-dialog.html');
                }, 500);
                settings.set('cleep.firstrun', false);
            }

        });
    };

    // toggle toolbar
    self.toggleToolbar = function() {
        self.toolbarCollapsed = !self.toolbarCollapsed;
    };

    // open page in content area (right side) handling 'openPage' event
    self.openPage = function(page) {
        // unselect all devices
        devicesService.selectDevice(null);

        // open specified page
        $state.go(page);
    };
    cleepUi.openPage = self.openPage;
    electron.on('openpage', function(_event, page) {
        self.openPage(page);
    });

    // open modal handling 'openModal' event
    self.openModal = function(controllerName, templateUrl, data) {
        modalService.open(controllerName, templateUrl, data || {});
    };
    cleepUi.openModal = self.openModal;
    electron.on('openmodal', function(_event, controllerName, templateUrl, data) {
        self.openModal(controllerName, templateUrl, data);
    });

    self.onCloseRestartRequiredTaskPanel = function() {
        // reset variable
        self.taskRestartRequiredPanel = null;
    };

    self.restartApplication = function() {
        electron.send('updater-quit-and-install');
    };

    // select toolbar icons
    $transitions.onEnter({}, function(_trans, state) {
        self.selectedToolbarItem = state.name;
    });

    // handle restart required event adding a task panel
    $rootScope.$on('restartrequired', function(_event, _data) {
        if (!self.taskRestartRequired) {
            self.taskRestartRequired = tasksPanelService.addItem(
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

    // restart application
    $rootScope.$on('restart', function(_event, _data) {
        self.restartApplication();
    });

    // disable/enable application quit when process is running (like install process)
    $rootScope.$on('disablequit', function(_event, _data) {
        electron.send('allow-quit', false);
    });
    $rootScope.$on('enablequit', function(_event, _data) {
        electron.send('allow-quit', true);
    });
}]);
