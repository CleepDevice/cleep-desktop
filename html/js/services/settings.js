angular
.module('Cleep')
.service('settingsService', ['electronService', function(electron) {
    var self = this;

    self.get = function(key) {
        return electron.sendReturn('settings-get', key, true);
    };

    self.set = function(key, value) {
        electron.send('settings-set', {key, value});
    };

    self.getFilepath = function() {
        return electron.sendReturn('settings-filepath', null, true);
    };

    self.has = function(key) {
        return electron.sendReturn('settings.has', key, true);
    };
}]);
