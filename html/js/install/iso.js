var Cleep = angular.module('Cleep')

/**
 * Iso select controller
 */
var isoSelectController = function(closeModal, installService, $timeout)
{
    var self = this;
    self.closeModal = closeModal;
    self.isos = [];
    self.config = installService.isos;
    self.loading = true;

    //controller init
    self.$onInit = function () {
        self.refreshIsos();
    };

    //refresh isos list
    self.__refreshIsos = function() {
        //copy locally iso from installService
        self.isos = [];
        for( var i=0; i<self.config.isos.length; i++ )
        {
            self.isos.push(self.config.isos[i]);
        }

        //append item id to allow easier selection
        var id = 0;
        for( id=0; id<self.isos.length; id++ )
        {
            self.isos[id].id = id;
        }
    };

    //refresh isos
    self.refreshIsos = function()
    {
        self.loading = true;

        return $timeout(function() {
            if( self.config.isos.length===0 ) {
                //no isos loaded yet, get list
                installService.refreshIsos()
                    .then(function() {
                        self.__refreshIsos();
                        self.loading = false;
                    });
            } else {
                //simply refresh internal list of isos
                self.__refreshIsos();
                self.loading = false;
            }
        }, 0);
    };

    //select raspbian iso
    self.selectRemoteIso = function(item) {
        self.closeModal(item);
    };

    //select local iso
    self.selectLocalIso = function(item)
    {
        var options = {
            title: 'Select local iso',
            filters: [
                {name: 'Iso file', extensions: ['zip', 'iso', 'img', 'dmg', 'raw']}
            ]
        };
        dialog.showOpenDialog(options, function(filenames) {
            if( filenames===undefined )
            {
                //no file selected
                return;
            }

            self.closeModal({
                'url': 'file://' + filenames[0],
                'label': path.parse(filenames[0]).base,
                'category': 'local',
            });
        });
    };

};
Cleep.controller('isoSelectController', ['closeModal', 'installService', '$timeout', isoSelectController]);
