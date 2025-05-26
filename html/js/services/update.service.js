/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.service('updateService', ['$rootScope', 'loggerService', 'tasksPanelService', 'electronService', 'toolsService',
function($rootScope, logger, tasksPanelService, electron, tools) {
    var self = this;
    self.taskUpdatePanelId = null;
    self.flashToolUpdate = {};
    self.cleepbusUpdate = {};
    self.cleepDesktopUpdate = {};
    self.restartRequired = false;
    self.softwareVersions = {
        cleepDesktop: null,
        flashTool: null,
        cleepbus: null,
    }
    self.lastUpdateCheck = 0;
    self.changelog = '';
 
    self.init = function() {
        self.addIpcs();
        self.updateSofwareVersions();
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
                tools.updateObject(self.softwareVersions, softwareVersions);
            });
    }

    self.goToUpdates = function() {
        $rootScope.$broadcast('open-page', { page: 'updates' });
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
        self.openUpdateTaskPanel();

        tools.updateObject(self.cleepDesktopUpdate, updateData);

        if (self.flashToolUpdate.terminated && self.cleepbusUpdate.terminated) {
            self.restartRequired = true;
            tools.clearObject(self.flashToolUpdate);
            tools.clearObject(self.cleepbusUpdate);
            self.closeUpdateTaskPanel();
            self.updateSofwareVersions();
        }
    };

    self.onFlashToolUpdateCallback = function(_event, updateData) {
        self.openUpdateTaskPanel();

        tools.updateObject(self.flashToolUpdate, updateData);
        console.log('+++++++', updateData, self.flashToolUpdate);

        if (self.flashToolUpdate.terminated) {
            tools.clearObject(self.flashToolUpdate);
            self.closeUpdateTaskPanel();
            self.updateSofwareVersions();
        }
    }

    self.onCleepbusUpdateCallback = function(_event, updateData) {
        self.openUpdateTaskPanel();
        
        tools.updateObject(self.cleepbusUpdate, updateData);

        if (self.cleepbusUpdate.terminated) {
            tools.clearObject(self.cleepbusUpdate);
            self.closeUpdateTaskPanel();
            self.updateSofwareVersions();
        }
    }

    self.checkForUpdates = function() {
        return electron.sendReturn('updater-check-for-updates')
            .then((updateStatus) => {
                // logger.info('Check for software updates', updateStatus);
                self.lastUpdateCheck = updateStatus.lastUpdateCheck;
        
                var hasUpdate = false;
                if (updateStatus.cleepDesktop) {
                    hasUpdate = true;
                    tools.updateObject(self.cleepDesktopUpdate, {percent:0, error: ''});
                }
                if (updateStatus.flashTool.update) {
                    hasUpdate = true;
                    tools.updateObject(self.flashToolUpdate, {percent:0, error: ''});
                }
                if (updateStatus.cleepbus.update) {
                    hasUpdate = true;
                    tools.updateObject(self.cleepbusUpdate, {percent:0, error: ''});
                }
        
                if (hasUpdate) {
                    self.openUpdateTaskPanel();
                }
        
                return hasUpdate;
            });
    };
}]);
