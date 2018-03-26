/**
 * Install service handles data useful to install module
 */
var installService = function($rootScope, logger, cleepService, settings)
{

    var self = this;
    self.isos = {
        isos: [],
        cleepisos: 0,
        raspbianisos: 0,
        withraspbianiso: false,
        withlocaliso: false
    }

    /**
     * Return wifi adapter infos
     */
    self.getWifiAdapter = function()
    {
        cleepService.sendCommand()
            .then(function(resp) {

            });
    };

    /**
     * Connect websocket to python server
     */
    self.getWifiNetworks = function()
    {
        cleepService.sendCommand()
            .then(function(resp) {

            });
    };

    /**
     * Return list of available drives
     */
    self.getDrives = function()
    {
        cleepService.sendCommand()
            .then(function(resp) {

            });
    };

    /**
     * Return all available isos according to current configuration
     */
    self.getIsos = function()
    {
        return cleepService.sendCommand('getisos')
            .then(function(resp) {
                self.isos.isos = resp.data.isos;
                self.isos.cleepisos = resp.data.cleepisos===0;
                self.isos.raspbianisos = resp.data.raspbianisos===0;
                self.isos.withraspbianiso = resp.data.withraspbianiso;
                self.isos.withlocaliso = resp.data.withlocaliso;
                
                //append new item for local iso
                if( self.isolocal )
                {
                    //select file entry
                    self.isos.push({
                        category: 'local',
                        label: 'Select file',
                        sha1: null,
                        timestamp: 0,
                        url: null,
                        selector: true
                    });

                    //selected file entry
                    var url = null;
                    var label = '-- no file selected --';
                    if( self.localIso.url ) {
                        url = self.localIso.url;
                        label = self.localIso.label;
                    }
                    self.isos.push({
                        category: 'local',
                        label: label,
                        sha1: null,
                        timestamp: 0,
                        url: url,
                        selector: false
                    });
                }

                //append item id to allow easier selection
                var id = 0;
                for( id=0; id<self.isos.length; id++ )
                {
                    self.isos[id].id = id;
                }
            });
    };

};

var Cleep = angular.module('Cleep');
Cleep.service('installService', ['$rootScope', 'logger', 'cleepService', 'settings', installService]);
