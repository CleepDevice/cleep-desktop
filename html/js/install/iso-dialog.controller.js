angular
.module('Cleep')
.controller('isoDialogController', ['closeModal', 'installService',
function(closeModal, installService) {
    var self = this;
    self.closeModal = closeModal;
    self.installService = installService;
    self.loading = false;

    self.$onInit = function () {
        self.loading = true;
        self.installService.refreshIsosInfo()
            .finally(() => {
                self.loading = false;
            });
    };

    self.selectRemoteIso = function(item) {
        self.closeModal(item);
    };

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
