var Cleep = angular.module('Cleep')

/**
 * Updates controller
 */
var updatesController = function($rootScope, $scope, cleepService)
{
    var self = this;
    self.status = null;

    //init controller
    self.init = function() {
        //get current status
        cleepService.sendCommand('getupdatesstatus')
            .then(function(resp) {
                self.status = resp.data;
            });
    };
    self.init();

    //handle updates update
    $rootScope.$on('updates', function(event, data) {
        console.log('updates received', data);
        self.status = data;
    });

};
Cleep.controller('updatesController', ['$rootScope', '$scope', 'cleepService', updatesController]);

