angular
.module('Cleep')
.service('settingsService', ['electronService', function(electron) {
    var self = this;
    self.locale = 'en';
    self.settings = {};
    
    self.get = function(key) {
        return electron.settings.get(key);
    };

    self.getAll = function() {
        return electron.settings.getAll();
    }

    self.getSelected = function(keys) {
        return electron.settings.getSelected(keys);
    }
    
    self.set = function(key, value) {
        electron.settings.set({key, value});
    };
    
    self.getFilepath = function() {
        return electron.settings.filepath();
    };
    
    self.has = function(key) {
        return electron.settings.has(key);
    };

    // load locale here for optimization
    self.get('cleep.locale')
        .then((locale) => {
            self.locale = locale;
        });
}]);
