var Cleep = angular.module('Cleep')

/**
 * Updates controller
 */
var updatesController = function($rootScope, $scope, cleepService, toast)
{
    var self = this;
    self.status = null;
    self.loading = false;

    //check for updates
    self.checkUpdates = function() {
        self.loading = true;
        cleepService.sendCommand('checkupdates')
            .then(function(resp) {
                if( resp.data.updateavailable===false )
                {
                    toast.info('No update available');
                }
                self.status.lastcheck = resp.data.lastcheck;
            })
            .finally(function() {
                self.loading = false;
            });
    };

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
Cleep.controller('updatesController', ['$rootScope', '$scope', 'cleepService', 'toastService', updatesController]);

