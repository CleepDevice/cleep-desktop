angular
.module('Cleep')
.controller('firmwarePickerController', ['closeModal', 'firmwareService', 'confirmService',
                                         'toastService', 'loggerService',
function(closeModal, firmwareService, confirm, toast, logger) {
    var self = this;
    self.closeModal = closeModal;
    self.firmwares = [];
    self.loading = true;

    self.firmwareIcon = function(fw) {
        if (!fw) {
            return 'chip';
        }
        if (fw.kind === 'micropython-app') {
            return 'language-python';
        }
        if (fw.kind === 'micropython-runtime') {
            return 'chip';
        }
        return 'flash';
    };

    self.firmwareTitle = function(fw) {
        return fw.name || fw.id || 'Firmware';
    };

    self.firmwareSubtitle = function(fw) {
        var parts = [];
        if (fw.app) {
            parts.push(fw.app);
        }
        if (fw.firmware_version) {
            parts.push('v' + fw.firmware_version);
        }
        if (fw.kind) {
            parts.push(fw.kind);
        }
        var targets = (fw.targets || []).join(', ');
        if (targets) {
            parts.push(targets);
        }
        if (fw.date) {
            parts.push(fw.date);
        }
        if (fw.module && fw.module !== fw.app) {
            parts.push('from ' + fw.module);
        }
        return parts.join(' · ');
    };

    self.decorate = function(list) {
        return (list || []).map(function(fw) {
            var item = angular.extend({}, fw);
            item.icon = self.firmwareIcon(fw);
            item.title = self.firmwareTitle(fw);
            item.subtitle = self.firmwareSubtitle(fw);
            item.rowButtons = [
                {
                    label: 'Select',
                    icon: 'check',
                    style: 'md-raised md-primary',
                    meta: fw,
                    click: function(meta) {
                        self.select(meta || fw);
                    },
                },
                {
                    label: 'Delete',
                    icon: 'delete',
                    style: 'md-raised',
                    meta: fw,
                    click: function(meta) {
                        self.deleteFirmware(meta || fw);
                    },
                },
            ];
            return item;
        });
    };

    self.refresh = function() {
        self.loading = true;
        return firmwareService.refreshList()
            .then(function(list) {
                self.firmwares = self.decorate(list);
            })
            .finally(function() {
                self.loading = false;
            });
    };

    self.select = function(fw) {
        if (!fw) {
            return;
        }
        closeModal(fw);
    };

    self.deleteFirmware = function(fw) {
        confirm.open(
            'Delete firmware',
            'Remove <strong>' + (fw.name || fw.id) + '</strong> from the local cache?',
            'Delete',
            'Cancel'
        ).then(function() {
            return firmwareService.deleteFirmware(fw.hash);
        }).then(function() {
            toast.success('Firmware deleted');
            return self.refresh();
        }).catch(function(error) {
            if (error) {
                logger.warn('Delete firmware failed', error);
            }
        });
    };

    self.refresh();
}]);
