var uiService = function($http, $q, $rootScope) {
    var self = this;
    self.uriUi = window.location.protocol + '//localhost:9666/ui';

    self.sendUi = function(command, params) {
        var d = $q.defer();
        var data = {
            command: command,
            params: params
        };

		$http({
            method: 'POST',
            url: self.uriUi,
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
};

var Cleep = angular.module('Cleep');
Cleep.service('uiService', ['$http', '$q', '$rootScope', uiService]);

