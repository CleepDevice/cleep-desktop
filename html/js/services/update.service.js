angular
.module('Cleep')
.service('updateService', ['$rootScope', 'loggerService', 'toolbarTaskService', 'electronService', 'ipcLifecycle',
function($rootScope, logger, toolbarTask, electron, ipcLifecycle) {
    var self = this;
    self.flashToolUpdate = { terminated: true };
    self.cleepbusUpdate = { terminated: true };
    self.cleepDesktopUpdate = { terminated: true };
    self.restartRequired = false;
    self.softwareVersions = {
        cleepDesktop: null,
        flashTool: null,
        cleepbus: null,
    };
    self.lastUpdateCheck = 0;
    self.changelog = '';
    self.loading = false;

    self.addIpcs = function() {
        self._unsubscribers.push(
            electron.updater.onCleepDesktopAvailable(self.onCleepDesktopUpdateCallback.bind(self)),
            electron.updater.onCleepDesktopProgress(self.onCleepDesktopUpdateCallback.bind(self)),
            electron.updater.onFlashToolAvailable(self.onFlashToolUpdateCallback.bind(self)),
            electron.updater.onFlashToolProgress(self.onFlashToolUpdateCallback.bind(self)),
            electron.updater.onCleepbusAvailable(self.onCleepbusUpdateCallback.bind(self)),
            electron.updater.onCleepbusProgress(self.onCleepbusUpdateCallback.bind(self)),
        );
    };

    ipcLifecycle.attach(self, self.addIpcs, function() {
        self.updateSofwareVersions();
    });

    self.updateSofwareVersions = function() {
        electron.updater.getSoftwareVersions()
            .then((softwareVersions) => {
                logger.debug('Software versions', softwareVersions);
                self.lastUpdateCheck = softwareVersions.lastUpdateCheck;
                angular.copy(softwareVersions, self.softwareVersions);
            });
    };

    self.goToUpdates = function() {
        $rootScope.$broadcast('open-page', { page: 'updates' });
    };

    self.syncUpdateToolbarTask = function(running) {
        if (running) {
            var percent = 0;
            var count = 0;
            [self.cleepDesktopUpdate, self.flashToolUpdate, self.cleepbusUpdate].forEach(function(item) {
                if (!item.terminated && typeof item.percent === 'number' && item.percent >= 0) {
                    percent += item.percent;
                    count += 1;
                }
            });
            toolbarTask.set('update', {
                page: 'updates',
                label: 'Updating...',
                title: 'Updating application...',
                status: 'running',
                percent: count ? Math.round(percent / count) : 0,
            });
            return;
        }

        var failed = [self.cleepDesktopUpdate, self.flashToolUpdate, self.cleepbusUpdate]
            .some(function(item) { return item.terminated && item.error; });
        if (failed) {
            toolbarTask.set('update', {
                page: 'updates',
                label: 'Update failed',
                title: 'Update failed - open Updates for details',
                status: 'error',
                percent: 100,
            });
            return;
        }

        if (self.restartRequired) {
            toolbarTask.set('update', {
                page: 'updates',
                label: 'Restart needed',
                title: 'Please restart CleepDesktop to apply updates',
                status: 'action',
                percent: 100,
            });
            return;
        }

        toolbarTask.set('update', {
            page: 'updates',
            label: 'Update done',
            title: 'Update finished - open Updates for details',
            status: 'success',
            percent: 100,
        });
    };

    self.onCleepDesktopUpdateCallback = function(_event, updateData) {
        angular.copy(updateData, self.cleepDesktopUpdate);
        self.cleepDesktopUpdate.message = `Updating to ${self.cleepDesktopUpdate.version}`;

        if (self.cleepDesktopUpdate.terminated && !self.cleepDesktopUpdate.error) {
            self.restartRequired = true;
            self.cleepDesktopUpdate.message = 'Updated successfully';
        } else if (self.cleepDesktopUpdate.terminated && self.cleepDesktopUpdate.error) {
            self.cleepDesktopUpdate.message = 'Update failed';
        } else if (!self.cleepDesktopUpdate.terminated) {
            self.syncUpdateToolbarTask(true);
        }

        self.updateOverallUpdateStatus();
    };

    self.onFlashToolUpdateCallback = function(_event, updateData) {
        angular.copy(updateData, self.flashToolUpdate);
        self.flashToolUpdate.message = `Updating to ${self.flashToolUpdate.version}`;

        if (self.flashToolUpdate.terminated && !self.flashToolUpdate.error) {
            self.flashToolUpdate.message = 'Updated successfully';
        } else if (self.flashToolUpdate.terminated && self.flashToolUpdate.error) {
            self.flashToolUpdate.message = 'Update failed';
        } else if (!self.flashToolUpdate.terminated) {
            self.syncUpdateToolbarTask(true);
        }

        self.updateOverallUpdateStatus();
    };

    self.onCleepbusUpdateCallback = function(_event, updateData) {
        angular.copy(updateData, self.cleepbusUpdate);
        self.cleepbusUpdate.message = `Updating to ${self.cleepbusUpdate.version}`;

        if (self.cleepbusUpdate.terminated && !self.cleepbusUpdate.error) {
            self.cleepbusUpdate.message = 'Updated successfully';
        } else if (self.cleepbusUpdate.terminated && self.cleepbusUpdate.error) {
            self.cleepbusUpdate.message = 'Update failed';
        } else if (!self.cleepbusUpdate.terminated) {
            self.syncUpdateToolbarTask(true);
        }

        self.updateOverallUpdateStatus();
    };

    self.checkForUpdates = function() {
        if (self.loading) {
            return;
        }

        self.loading = true;
        return electron.updater.checkForUpdates()
            .then((updateStatus) => {
                logger.info('Check for software updates', updateStatus);
                self.lastUpdateCheck = updateStatus.lastUpdateCheck;

                self.applyCheckError('cleepDesktopUpdate', updateStatus.cleepDesktop);
                self.applyCheckError('flashToolUpdate', updateStatus.flashTool);
                self.applyCheckError('cleepbusUpdate', updateStatus.cleepbus);

                const hasUpdate = updateStatus.cleepDesktop?.updateAvailable
                  || updateStatus.flashTool?.updateAvailable
                  || updateStatus.cleepbus?.updateAvailable;
                if (hasUpdate) {
                    self.syncUpdateToolbarTask(true);
                    self.updateOverallUpdateStatus();
                } else {
                    self.loading = false;
                }

                return hasUpdate;
            })
            .catch((error) => {
                logger.error('Check for updates failed', error);
                self.loading = false;
                throw error;
            });
    };

    self.applyCheckError = function(field, status) {
        if (!(status?.error && !status?.updateAvailable)) {
            return;
        }
        const payload = {
            terminated: true,
            percent: 100,
            error: status.error,
            message: 'Update failed',
        };
        if (field === 'cleepDesktopUpdate') {
            self.cleepDesktopUpdate = payload;
        } else if (field === 'flashToolUpdate') {
            self.flashToolUpdate = payload;
        } else if (field === 'cleepbusUpdate') {
            self.cleepbusUpdate = payload;
        }
    };

    self.updateOverallUpdateStatus = function() {
        if (!self.cleepbusUpdate.terminated || !self.flashToolUpdate.terminated || !self.cleepDesktopUpdate.terminated) {
            return;
        }

        self.syncUpdateToolbarTask(false);
        self.updateSofwareVersions();
        self.loading = false;
    };
}]);
