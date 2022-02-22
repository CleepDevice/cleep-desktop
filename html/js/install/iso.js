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

    self.$onInit = function () {
        self.refreshIsos();
    };

    self.__refreshIsos = function() {
        // copy locally iso from installService
        self.isos = [];
        for (var i = 0; i < self.config.isos.length; i++) {
            self.isos.push(self.config.isos[i]);
        }

        // append item id to allow easier selection
        for (var id = 0; id < self.isos.length; id++) {
            self.isos[id].id = id;
        }
    };

    self.refreshIsos = function() {
        self.loading = true;

        installService.refreshIsos()
            .then(function() {
                self.__refreshIsos();
                self.loading = false;
            });
    };

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
        // TODO handle dialog in electron area
        // const result = dialog.showOpenDialogSync(options);
        // if (result && result.length) {
        //     self.closeModal({
        //         'url': 'file://' + result[0],
        //         'label': path.parse(result[0]).base,
        //         'category': 'local',
        //     });
        // }
    };

}]);
