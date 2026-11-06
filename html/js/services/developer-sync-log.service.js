angular
.module('Cleep')
.service('developerSyncLogService', ['loggerService', 'electronService', 'ipcLifecycle',
function(logger, electron, ipcLifecycle) {
    var self = this;
    self.maxMessages = 200;
    self.messages = [];

    self.addIpcs = function() {
        if (!electron.developer || !electron.developer.onSyncLog) {
            return;
        }
        self._unsubscribers.push(
            electron.developer.onSyncLog(self.onSyncLog.bind(self)),
        );
    };

    ipcLifecycle.attach(self, self.addIpcs);

    self.onSyncLog = function(_event, entry) {
        if (!entry) {
            return;
        }

        logger.debug('Developer sync log:', entry);
        self.messages.unshift(entry);

        if (self.messages.length > self.maxMessages) {
            self.messages.pop();
        }
    };

    self.clearMessages = function() {
        self.messages.splice(0, self.messages.length);
    };

    self.levelIcon = function(level) {
        if (level === 'success') {
            return 'check-circle';
        }
        if (level === 'error') {
            return 'alert-circle';
        }
        return 'sync';
    };

    self.reasonLabel = function(reason) {
        if (reason === 'manual') {
            return 'manual';
        }
        if (reason === 'start') {
            return 'initial';
        }
        if (reason === 'watch') {
            return 'file change';
        }
        if (reason === 'queued') {
            return 'queued';
        }
        return '';
    };

    /** Detail is mostly redundant with title + app chips; keep errors and unusual notes. */
    self.shouldShowDetail = function(message) {
        if (!message || !message.detail) {
            return false;
        }
        if (message.level === 'error') {
            return true;
        }
        // No target chips → detail carries the meaning (e.g. empty selection).
        if (!message.apps || !message.apps.length) {
            return true;
        }
        return false;
    };
}]);
