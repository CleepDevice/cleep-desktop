/**
 * Preferences controller
 */
angular
.module('Cleep')
.controller('preferencesController', ['$rootScope', '$scope', 'cleepService', 'debounceService', 'closeModal', 'logger',
function($rootScope, $scope, cleepService, debounce, closeModal, logger) {
    var self = this;

    self.shell = require('electron').shell;
    self.pref = 'general';
    self.config = {};
    self.noproxy = false;
    self.manualproxy = false;
    self.logs = '';
    self.cacheDir = '';
    self.cacheds = [];
    self.closeModal = closeModal;

    //automatic settings saving when config value changed
    $scope.$watch(function() {
        return self.config;
    }, function(newValue, oldValue) {
        if( Object.keys(newValue).length>0 && Object.keys(oldValue).length>0 ) {
            if( self.checkConfig() ) {
                debounce.exec('config', self.setConfig, 500)
                    .then(function() {
                        // console.log('Config saved');
                    }, function() {})
            }
        }
    }, true);

    //check configuration
    //@return true if config is valid, false otherwise
    self.checkConfig = function() {
        if( self.config ) {
            if( self.config.remote && !self.config.remote.rpcport )
                return false;
            if( self.config.proxy && !self.config.proxy.host )
                return false;
            if( self.config.proxy && !self.config.proxy.port )
                return false;

            return true;
        }

        return false;
    };

    //get configuration
    self.getConfig = function() {
        cleepService.getConfig()
            .then(function(resp) {
                //save config
                self.config = resp.data.config;
                self.logs = resp.data.logs;
                self.cacheDir = resp.data.cachedir;

                //update proxy mode
                self.updateProxyMode(self.config.proxy.mode);
            });

        cleepService.sendCommand('get_cached_files', 'cache')
            .then(function(resp) {
                self.cacheds = resp.data;
            });
    };

    //set configuration
    self.setConfig = function() {
        cleepService.setConfig(self.config)
            .then(function(resp) {
                //overwrite config if specified
                if( resp && resp.data && resp.data.config ) {
                    self.config = resp.data.config;
                }

                //send broadcast event to say config changed
                $rootScope.$broadcast('configchanged', self.config);
            });
    };

    //update proxy mode
    self.updateProxyMode = function(mode) {
        if( mode==='noproxy' ) {
            self.noproxy = true;
            self.manualproxy = false;
        } else if( mode==='manualproxy' ) {
            self.noproxy = false;
            self.manualproxy = true;
        }
        self.config.proxy.mode = mode;
    };

    // Open logs
    self.openLogs = function() {
        self.shell.openPath(self.logs).catch(
            error => logger.error('Unable to open logs ' + error)
        );
    };

    // Open logs archive (zip format)
    self.zipLogs = function() {
        cleepService.sendCommand('get_zipped_logs', 'core')
            .then(function(resp) {
                self.shell.openPath(resp.data).catch(
                    error => logger.error('Unable to open logs ' + error)
                );
            });
    };

    // Delete specified cached file
    self.purgeCacheFile = function(filename) {
        cleepService.sendCommand('delete_cached_file', 'cache', {filename:filename})
            .then(function(resp) {
                self.cacheds = resp.data;
            });
    };

    // Purge all cached files
    self.purgeCachedFiles = function() {
        cleepService.sendCommand('purge_cached_files', 'cache')
            .then(function(resp) {
                self.cacheds = resp.data;
            });
    };

    //init controller
    self.getConfig();
}]);
