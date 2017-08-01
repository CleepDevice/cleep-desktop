var uiService = function($http, $q, $rootScope, $location) {

    var self = this;

    //get port from url
    var urlValues = $location.search();
    self.port = 5610;
    if( urlValues && urlValues.port )
    {
        self.port = urlValues.port;
    }
    
    //configure url
    self.uriCommand = window.location.protocol + '//localhost:' + self.port + '/command';
    self.uriUi = window.location.protocol + '//localhost:' + self.port + '/ui';
    self.uriConfig = window.location.protocol + '//localhost:' + self.port + '/config';
    self.uriBack = window.location.protocol + '//localhost:' + self.port + '/back';

    /**
     * Base function to send data to rpcserver
     */
    self.send = function(url, command, params) {
        var d = $q.defer();
        var data = {
            command: command,
            params: params
        };

		$http({
            method: 'POST',
            url: url,
            data: data,
            responseType:'json'
        })
        .then(function(resp) {
            d.resolve(resp.data);
        }, function(err) {
            console.error('Request failed: '+err);
            d.reject(err.statusText);
        });

        return d.promise;
    };

    /**
     * Send command to rpcserver
     */
    self.sendCommand = function(command, params) {
        //check parameters
        if( params===undefined || params===null )
        {
            params = {};
        }

        //prepare data to send
        var data = {
            command: command,
            params: params
        };

        return self.send(self.uriCommand, data);
    };

    /**
     * Send command to ui
     */
    self.sendUi = function(command, params) {
        //check parameters
        if( params===undefined || params===null )
        {
            params = {};
        }

        //prepare data to send
        var data = {
            command: command,
            params: params
        };

        return self.send(self.uriUi, data);
    };

    /**
     * Get cleep-desktop config
     */
    self.getConfig = function() {
        return self.send(self.uriConfig);
    };

    /**
     * Go back in history. Works only once
     */
    self.back = function() {
        return self.send(self.uriBack);
    };
};

var Cleep = angular.module('Cleep');
Cleep.service('uiService', ['$http', '$q', '$rootScope', '$location', uiService]);

