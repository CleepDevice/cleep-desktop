angular
.module('Cleep')
.service('settingsService', ['electronService', function(electron) {

    var self = this;
    self.locale = 'en';
    
    self.get = function(key) {
        return electron.sendReturn('settings-get', key);
    };

    self.getAll = function(keys) {
        return electron.sendReturn('settings-get-multiple', keys);
    }
    
    self.set = function(key, value) {
        electron.send('settings-set', {key, value});
    };
    
    self.getFilepath = function() {
        return electron.sendReturn('settings-filepath');
    };
    
    self.has = function(key) {
        return electron.sendReturn('settings.has', key);
    };

    // load locale here for optimization
    self.get('cleep.locale')
        .then((locale) => {
            self.locale = locale;
        });
}]);
