var uiService = function($http, $q, $rootScope) {
    var self = this;
    self.uriUi = window.location.protocol + '//localhost:5610/ui';
    self.uriConfig = window.location.protocol + '//localhost:5610/config';
    self.uriBack = window.location.protocol + '//localhost:5610/back';

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
Cleep.service('uiService', ['$http', '$q', '$rootScope', uiService]);

