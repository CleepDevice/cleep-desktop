angular
.module('Cleep')
.service('updateService', ['$rootScope', '$timeout', 'loggerService', 'tasksPanelService', 'electronService',
function($rootScope, $timeout, logger, tasksPanelService, electron) {

    var self = this;
    self.taskUpdatePanelId = null;
    self.flashToolUpdate = {};
    self.cleepbusUpdate = {};
    self.cleepDesktopUpdate = {};
    self.restartRequired = false;
    self.softwareVersions = {
        cleepDesktop: null,
        flashTool: null,
    }
    self.lastUpdateCheck = 0;
    self.changelog = '';
 
    self.init = function() {
        self.addIpcs();
        self.updateSofwareVersions();

        $timeout(() => {
            self.checkForUpdates('auto');
        }, 10 * 1000);
    };
 
    self.addIpcs = function() {
        electron.on('updater-cleepdesktop-update-available', self.onCleepDesktopUpdateCallback.bind(self));
        electron.on('updater-cleepdesktop-download-progress', self.onCleepDesktopUpdateCallback.bind(self));
        electron.on('updater-flashtool-update-available', self.onFlashToolUpdateCallback.bind(self));
        electron.on('updater-flashtool-download-progress', self.onFlashToolUpdateCallback.bind(self));
        electron.on('updater-cleepbus-update-available', self.onCleepbusUpdateCallback.bind(self));
        electron.on('updater-cleepbus-download-progress', self.onCleepbusUpdateCallback.bind(self));
    };

    self.updateSofwareVersions = function() {
        electron.sendReturn('updater-get-software-versions')
            .then((softwareVersions) => {
                logger.debug('Software versions', softwareVersions);
                self.lastUpdateCheck = softwareVersions.lastUpdateCheck;
                Object.assign(self.softwareVersions, softwareVersions);
            });
    }

    self.goToUpdates = function() {
        $rootScope.$broadcast('open-page', 'updates');
    };
 
    self.closeUpdateTaskPanel = function() {
        var isCleepdesktopUpdating = Object.keys(self.cleepDesktopUpdate).length > 0;
        var isFlashToolUpdating = Object.keys(self.flashToolUpdate).length > 0;
        var isCleepbusUpdating = Object.keys(self.cleepbusUpdate).length > 0;

        if (!isCleepdesktopUpdating && !isFlashToolUpdating && !isCleepbusUpdating) {
            tasksPanelService.removePanel(self.taskUpdatePanelId);
            self.taskUpdatePanelId = null;
        }
    };

    self.openUpdateTaskPanel = function() {
        if (self.taskUpdatePanelId) {
            return;
        }
        self.taskUpdatePanelId = tasksPanelService.addPanel(
            'Updating application...',
            {
                onAction: self.goToUpdates,
                tooltip: 'Open updates page',
                icon: 'open-in-app'
            },
            {
                onClose: null,
                disabled: true
            },
            true
        );
    };
    
    self.onCleepDesktopUpdateCallback =  function(_event, updateData) {
        Object.assign(self.cleepDesktopUpdate, updateData);

        if (self.flashToolUpdate.terminated && self.cleepbusUpdate.terminated) {
            self.restartRequired = true;
            self.clearObject(self.flashToolUpdate);
            self.clearObject(self.cleepbusUpdate);
            self.closeUpdateTaskPanel();
            self.updateSofwareVersions();
        }
    };

    self.onFlashToolUpdateCallback = function(_event, updateData) {
        Object.assign(self.flashToolUpdate, updateData);

        if (self.flashToolUpdate.terminated) {
            self.clearObject(self.flashToolUpdate);
            self.closeUpdateTaskPanel();
            self.updateSofwareVersions();
        }
    }

    self.onCleepbusUpdateCallback = function(_event, updateData) {
        Object.assign(self.cleepbusUpdate, updateData);

        if (self.cleepbusUpdate.terminated) {
            self.clearObject(self.cleepbusUpdate);
            self.closeUpdateTaskPanel();
            self.updateSofwareVersions();
        }
    }

    self.checkForUpdates = function(mode = 'manual') {
        return electron.sendReturn('updater-check-for-updates', mode)
            .then((updateStatus) => {
                // logger.info('Check for software updates', updateStatus);
                self.lastUpdateCheck = updateStatus.lastUpdateCheck;
        
                var hasUpdate = false;
                if (updateStatus.cleepDesktop) {
                    hasUpdate = true;
                    Object.assign(self.cleepDesktopUpdate, {percent: 0, error: ''});
                }
                if (updateStatus.flashTool) {
                    hasUpdate = true;
                    Object.assign(self.flashToolUpdate, {percent: 0, error: ''});
                }
        
                if (hasUpdate) {
                    self.openUpdateTaskPanel();
                }
        
                return hasUpdate;
            });
    };

    self.clearObject = function(obj) {
        for (var key in obj) {
            delete obj[key];
        }
    }
}]);
