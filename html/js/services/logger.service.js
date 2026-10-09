angular
.module('Cleep')
.service('loggerService', ['electronService', function(electron) {
    var self = this;

    self.debug = function(message, extra) {
        electron.logger.log({level: 'debug', message, extra});
    };

    self.info = function(message, extra) {
        electron.logger.log({level: 'info', message, extra});
    };

    self.warn = function(message, extra) {
        electron.logger.log({level: 'warn', message, extra});
    };

    self.error = function(message, extra) {
        electron.logger.log({level: 'error', message, extra});
    };
}]);
