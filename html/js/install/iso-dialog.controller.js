angular
.module('Cleep')
.controller('isoDialogController', ['closeModal', 'installService', 'electronService',
function(closeModal, installService, electron) {
    var self = this;
    self.closeModal = closeModal;
    self.installService = installService;
    self.loading = false;

    self.$onInit = function () {
        self.loading = true;
        self.installService.getIsoSettings()
            .then(() => {
                return self.installService.refreshIsosInfo();
            })
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
                    extensions: ['zip', 'iso', 'img', 'dmg', 'raw', 'xz']
                }
            ]
        };

        electron.sendReturn('open-dialog', options)
            .then((result) => {
                if (result.length) {
                    var filename = result[0].split('\\').pop().split('/').pop()
                    var data = {
                        'url': 'file://' + result[0],
                        'label': filename,
                        'filename': filename,
                        'category': 'local',
                        'date': new Date(),
                        'size': 0,
                        'sha256': undefined,
                    }
                    self.closeModal(data);
                }
            });
    };
}]);
