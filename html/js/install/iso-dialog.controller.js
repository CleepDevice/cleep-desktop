angular
.module('Cleep')
.controller('isoDialogController', ['closeModal', 'installService', 'electronService',
function(closeModal, installService, electron) {
    var self = this;
    self.closeModal = closeModal;
    self.installService = installService;
    self.loading = false;

    self.refreshIsos = function(force) {
        self.loading = true;
        self.installService.getIsoSettings()
            .then(() => {
                return self.installService.refreshIsosInfo(Boolean(force));
            })
            .finally(() => {
                self.loading = false;
            });
    };

    self.$onInit = function () {
        self.refreshIsos(false);
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

        electron.shell.openDialog(options)
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
