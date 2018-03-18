/**
 * Update service handles CleepDesktop updates using appUdater
 * This service handles properly update taskpanel
 * It can returns Cleepdesktop update status and last error
 */
var updateService = function($rootScope, logger, appUpdater, $timeout, tasksPanelService, cleepUi, $q) 
{
    var self = this;
    self.taskUpdatePanel = null;
    self.taskUpdatePanelClosedByUser = false;
    self.updatingCleepdesktop = false;
    self.updatingEtcher = false;
    self.lastCleepdesktopUpdateError = '';
    self.cleepdesktopUpdatesDisabled = false;
    self.cleepdesktopUpdateAvailable = false;

    //Go to updates page
    self.__goToUpdates = function()
    {
        cleepUi.openPage('updates');
    };

    //On close update task panel
    self.__onCloseUpdateTaskPanel = function()
    {
        //reset variable
        self.taskUpdatePanel = null;
        self.taskUpdatePanelClosedByUser = true;
    };

    //Handle opening/closing of update task panel according to current cleepdesktop and etcher update status
    self.__handleUpdateTaskPanel = function()
    {
        if( (self.updatingCleepdesktop || self.updatingEtcher) && self.taskUpdatePanelClosedByUser )
        {
            //update task panel closed by user, do not open again
        }
        else if( !self.updatingCleepdesktop && !self.updatingEtcher && self.taskUpdatePanelClosedByUser )
        {
            //update task panel closed by user but updates terminated, reset flag
            self.taskUpdatePanelClosedByUser = false;
        }
        else if( (self.updatingCleepdesktop || self.updatingEtcher) && !self.taskUpdatePanel )
        {
            //no update task panel opened yet while update is in progress, open it
            self.taskUpdatePanel = tasksPanelService.addItem(
                'Updating application...', 
                {
                    onAction: self.goToUpdates,
                    tooltip: 'Go to updates',
                    icon: 'update'
                },
                {
                    onClose: self.onCloseUpdateTaskPanel,
                    disabled: false
                },
                true
            );
        }
        else if( !self.updatingCleepdesktop && !self.updatingEtcher && self.taskUpdatePanel )
        {
            //no update is running and task panel is opened, close it
            tasksPanelService.removeItem(self.taskUpdatePanel);
            self.taskUpdatePanel = null;
            self.taskUpdatePanelClosedByUser = false;
        }
    };

    //Init update service adding appUpdater and cleepdesktopcore events handlers
    self.init = function()
    {
        if( process.platform==='darwin' )
        {
            //disable auto updates on macos due to missing certification key that is needed :(
            self.cleepdesktopUpdatesDisabled = true;
            appUpdater.autoDownload = false;
            logger.info('Updates are disabled on MacOs because we need to pay 99$ to get Apple Developper ID. ' +
            'If Cleep project earns money one day, we will reconsider that.');
        }

        //Handle etcher update here to add update task panel
        $rootScope.$on('updates', function(event, data) {
            if( !data )
                return;

            if( data.etcherstatus.status>=3 )
            {
                //update is terminated
                self.updatingEtcher = false;
            }
            else if( !self.taskUpdatePanel && data.etcherstatus.status>0 )
            {
                //update is started
                self.updatingEtcher = true;
            }

            //update task panel
            self.__handleUpdateTaskPanel();
        });

        //Handle cleepdesktop update here to add update task panel
        appUpdater.addListener('update-available', function(info) {
            //update available, open task panel if necessary
            logger.debug('AppUpdater: update-available');

            //update new version available flag
            self.cleepdesktopUpdateAvailable = true;

            if( !self.cleepdesktopUpdatesDisabled )
            {
                //update downloading flag
                self.updatingCleepdesktop = true;

                //update task panel
                self.__handleUpdateTaskPanel();
            }
            else
            {
                //update is disabled, show message to user
                self.taskUpdatePanel = tasksPanelService.addItem(
                    'New CleepDesktop version available.', 
                    {
                        onAction: self.goToUpdates,
                        tooltip: 'Go to updates',
                        icon: 'update'
                    }
                );
            }
        });
        appUpdater.addListener('update-downloaded', function(info) {
            //update downloaded, close task panel
            logger.debug('AppUpdater: update-downloaded');
            if( !self.cleepdesktopUpdatesDisabled )
            {
                //update flags
                self.updatingCleepdesktop = false;
                self.cleepdesktopUpdateAvailable = false;

                //update task panel
                self.__handleUpdateTaskPanel();
            }
        });
        appUpdater.addListener('error', function(error) {
            //error during update, close task panel
            if( !self.cleepdesktopUpdatesDisabled )
            {
                //update flags
                logger.error('AppUpdater: error ' + error.message);
                self.updatingCleepdesktop = false;
                self.lastCleepdesktopUpdateError = error.message;

                //update task panel (delay it to make sure taskpanel is displayed)
                $timeout(function() {
                    self.__handleUpdateTaskPanel();
                }, 1500);
            }
        });
    };

    // Check updates
    // @return promise
    self.checkForUpdates = function()
    {
        logger.info('Check for CleepDesktop update');
        var defer = $q.defer();
        appUpdater.checkForUpdates()
            .then(function(resp) {
                defer.resolve(resp);
            }, function(err) {
                defer.reject(err);
            });
        return defer.promise;
    };

    // Return last cleepdesktop update error
    self.getLastCleepdesktopUpdateError = function()
    {
        return self.lastCleepdesktopUpdateError;
    };

    // Return Cleepdesktop update status
    self.isUpdatingCleepdesktop = function()
    {
        return self.updatingCleepdesktop;
    };

    // Return Etcher update status
    self.isUpdatingEtcher = function()
    {
        return self.updatingEtcher;
    };

    //Is cleepdesktop updates disabled
    self.isCleepdesktopUpdatesDisabled = function()
    {
        return self.cleepdesktopUpdatesDisabled;
    };

    //Is cleepdesktop updates available
    self.isCleepdesktopUpdatesAvailable = function()
    {
        return self.cleepdesktopUpdateAvailable;
    };

};
    
var Cleep = angular.module('Cleep');
Cleep.service('updateService', ['$rootScope', 'logger', 'appUpdater', '$timeout', 'tasksPanelService', 'cleepUi', 
            '$q', updateService]);
