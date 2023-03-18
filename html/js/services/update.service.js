/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.service('updateService', ['$rootScope', 'loggerService', 'tasksPanelService', 'electronService',
function($rootScope, logger, tasksPanelService, electron) {
    var self = this;
    self.taskUpdatePanelId = null;
    self.flashToolUpdate = { terminated: true };
    self.cleepbusUpdate = { terminated: true };
    self.cleepDesktopUpdate = { terminated: true };
    self.restartRequired = false;
    self.softwareVersions = {
        cleepDesktop: null,
        flashTool: null,
        cleepbus: null,
    }
    self.lastUpdateCheck = 0;
    self.changelog = '';
    self.loading = false;
 
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
                angular.copy(softwareVersions, self.softwareVersions);
            });
    }

    self.goToUpdates = function() {
        $rootScope.$broadcast('open-page', { page: 'updates' });
    };
 
    self.closeUpdateTaskPanel = function() {
        tasksPanelService.removePanel(self.taskUpdatePanelId);
        self.taskUpdatePanelId = null;
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
        angular.copy(updateData, self.cleepDesktopUpdate);
        self.cleepDesktopUpdate.message = `Updating to ${self.cleepDesktopUpdate.version}`;

        if (self.cleepDesktopUpdate.terminated && !self.cleepDesktopUpdate.error) {
            self.restartRequired = true;
            self.cleepDesktopUpdate.message = 'Updated successfully';
        } else if (!self.cleepDesktopUpdate.terminated) {
            self.openUpdateTaskPanel();
        }

        this.updateOverallUpdateStatus();
    };

    self.onFlashToolUpdateCallback = function(_event, updateData) {
        angular.copy(updateData, self.flashToolUpdate);
        self.flashToolUpdate.message = `Updating to ${self.flashToolUpdate.version}`;

        if (self.flashToolUpdate.terminated) {
            self.flashToolUpdate.message = 'Updated successfully';
        } else {
            self.openUpdateTaskPanel();
        }

        this.updateOverallUpdateStatus();
    }

    self.onCleepbusUpdateCallback = function(_event, updateData) {
        angular.copy(updateData, self.cleepbusUpdate);
        self.cleepbusUpdate.message = `Updating to ${self.cleepbusUpdate.version}`;

        if (self.cleepbusUpdate.terminated) {
            self.cleepbusUpdate.message = 'Updated successfully';
        } else {
            self.openUpdateTaskPanel();
        }

        this.updateOverallUpdateStatus();
    }

    self.checkForUpdates = function() {
        if (self.loading) {
            return;
        }

        self.loading = true;
        return electron.sendReturn('updater-check-for-updates')
            .then((updateStatus) => {
                logger.info('Check for software updates', updateStatus);
                self.lastUpdateCheck = updateStatus.lastUpdateCheck;
        
                angular.copy(updateStatus.cleepDesktop, self.cleepDesktopUpdate);
                angular.copy(updateStatus.flashTool, self.flashToolUpdate);
                angular.copy(updateStatus.cleepbus, self.cleepbusUpdate);

                const hasUpdate = updateStatus.cleepDesktop?.updateAvailable 
                    || updateStatus.flashTool?.updateAvailable
                    || updateStatus.cleepbus?.updateAvailable;
                if (hasUpdate) {
                    self.openUpdateTaskPanel();
                } else {
                    self.loading = false;
                }
        
                return hasUpdate;
            });
    };

    self.updateOverallUpdateStatus = function() {
        if (!self.cleepbusUpdate.terminated || !self.flashToolUpdate.terminated || !self.cleepDesktopUpdate.terminated) {
            return;
        }

        self.closeUpdateTaskPanel();
        self.updateSofwareVersions();
        self.loading = false;
    }
}]);
