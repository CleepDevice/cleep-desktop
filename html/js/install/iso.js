/**
 * Iso controller
 */
angular
.module('Cleep')
.controller('isoController', ['closeModal', 'installService',
function(closeModal, installService) {
    var self = this;
    self.closeModal = closeModal;
    self.isos = [];
    self.config = installService.isos;
    self.loading = true;

    // controller init
    self.$onInit = function () {
        self.refreshIsos();
    };

    // refresh isos list
    self.__refreshIsos = function() {
        // copy locally iso from installService
        self.isos = [];
        for( var i=0; i<self.config.isos.length; i++ ) {
            self.isos.push(self.config.isos[i]);
        }

        // append item id to allow easier selection
        var id = 0;
        for( id=0; id<self.isos.length; id++ ) {
            self.isos[id].id = id;
        }
    };

    // refresh isos
    self.refreshIsos = function() {
        self.loading = true;

        installService.refreshIsos()
            .then(function() {
                self.__refreshIsos();
                self.loading = false;
            });
    };

    // select raspios iso
    self.selectRemoteIso = function(item) {
        self.closeModal(item);
    };

    // select local iso
    self.selectLocalIso = function() {
        var options = {
            title: 'Select local iso',
            openFile: true,
            openDirectory: false,
            multiSelections: false,
            showHiddenFiles: false,
            filters: [
                {
                    name: 'Iso file',
                    extensions: ['zip', 'iso', 'img', 'dmg', 'raw']
                }
            ]
        };
        dialog.showOpenDialog(options)
            .then((result) => {
                if (result.canceled) {
                    // dialog canceled
                    return;
                }
                if (!result.filePaths || result.filePaths.length === 0) {
                    // no file selected
                    return;
                }

                self.closeModal({
                    'url': 'file://' + result.filePaths[0],
                    'label': path.parse(result.filePaths[0]).base,
                    'category': 'local',
                });
            })
            .catch(err => {
                console.log(err);
            });
    };

}]);
