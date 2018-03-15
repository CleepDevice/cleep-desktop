var Cleep = angular.module('Cleep');

/**
 * Preferences controller
 */
var preferencesController = function($rootScope, $scope, cleepService, debounce, closeModal)
{
    var self = this;

    self.shell = require('electron').shell;
    self.pref = 'general';
    self.config = {};
    self.noproxy = false;
    self.manualproxy = false;
    self.logs = '';
    self.cacheds = [];
    self.closeModal = closeModal;

    //automatic settings saving when config value changed
    $scope.$watch(function() {
        return self.config;
    }, function(newValue, oldValue) {
        if( Object.keys(newValue).length>0 && Object.keys(oldValue).length>0 )
        {
            if( self.checkConfig() )
            {
                debounce.exec('config', self.setConfig, 500)
                    .then(function() {
                        //console.log('Config saved');
                    }, function() {})
            }
        }
    }, true);

    //check configuration
    //@return true if config is valid, false otherwise
    self.checkConfig = function()
    {
        if( self.config )
        {
            if( self.config.remote && !self.config.remote.rpcport )
                return false;
            if( self.config.proxy && !self.config.proxy.host )
                return false;
            if( self.config.proxy && !self.config.proxy.port )
                return false;

            return true;
        }
        else
        {
            return false;
        }
    };

    //get configuration
    self.getConfig = function()
    {
        cleepService.getConfig()
            .then(function(resp) {
                //save config
                self.config = resp.data.config;
                self.logs = resp.data.logs;

                //update proxy mode
                self.updateProxyMode(self.config.proxy.mode);
            });

        cleepService.sendCommand('getcachedfiles')
            .then(function(resp) {
                self.cacheds = resp.data;
            });
    };

    //set configuration
    self.setConfig = function()
    {
        cleepService.setConfig(self.config)
            .then(function(resp) {
                //overwrite config if specified
                if( resp && resp.data && resp.data.config )
                {
                    self.config = resp.data.config;
                }
            });
    };

    //update proxy mode
    self.updateProxyMode = function(mode)
    {
        if( mode==='noproxy' )
        {
            self.noproxy = true;
            self.manualproxy = false;
        }
        else if( mode==='manualproxy' )
        {
            self.noproxy = false;
            self.manualproxy = true;
        }
        self.config.proxy.mode = mode;
    };

    // Open logs
    self.openLogs = function()
    {
        self.shell.openItem(self.logs);
    };

    // Delete specified cached file
    self.purgeCacheFile = function(filename)
    {
        cleepService.sendCommand('deletecachedfile', {filename:filename})
            .then(function(resp) {
                self.cacheds = resp.data;
            });
    };

    // Purge all cached files
    self.purgeCachedFiles = function()
    {
        cleepService.sendCommand('purgecachedfiles')
            .then(function(resp) {
                self.cacheds = resp.data;
            });
    };

    //init controller
    self.getConfig();
};
Cleep.controller('preferencesController', ['$rootScope', '$scope', 'cleepService', 'debounceService', 'closeModal', preferencesController]);

