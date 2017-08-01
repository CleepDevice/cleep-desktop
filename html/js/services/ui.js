var uiService = function($http, $q, $rootScope, $location) {

    var self = this;

    //get port from url
    var urlValues = $location.search();
    self.port = 5610;
    if( urlValues && urlValues.port )
    {
        console.log('port in url');
        self.port = urlValues.port;
    }
    console.log('port='+self.port);
    
    //configure url
    self.uriUi = window.location.protocol + '//localhost:' + self.port + '/ui';
    self.uriConfig = window.location.protocol + '//localhost:' + self.port + '/config';
    self.uriBack = window.location.protocol + '//localhost:' + self.port + '/back';

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

    self.getConfig = function() {
        return self.send(self.uriConfig);
    };

    self.back = function() {
        return self.send(self.uriBack);
    };
};

var Cleep = angular.module('Cleep');
Cleep.service('uiService', ['$http', '$q', '$rootScope', '$location', uiService]);

