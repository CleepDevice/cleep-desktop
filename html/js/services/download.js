/**
 * Download service handle download from angularjs app handling download panels
 */
angular
.module('Cleep')
.service('downloadService', ['tasksPanelService', 'toastService', 'electronService',
function(tasksPanelService, toast, electron) {
    var self = this;
    self.downloadPanels = {};

    self.init = function() {
        self.__addIpcs();
    };

    self.downloadUrl = function(url) {
        if (this.__isDownloadWithUrl(url)) {
            toast.warning('File is already downloading');
            return;
        }
        electron.send('download-file', url);
    }

    self.__isDownloadWithUrl = function(url) {
        for (var panel of Object.values(self.downloadPanels)) {
            if (panel.url === url) {
                return true;
            }
        }
        return false;
    }

    self.cancelDownload = function(downloadId) {
        var panel = self.downloadPanels[downloadId];
        if (panel) {
            tasksPanelService.removeItem(panel.panelId);
            delete self.downloadPanels[downloadId];
        }
        electron.send('download-file-cancel', downloadId);
    };

    self.__getDownloadPanel = function(url) {
        for (var i=0; i<self.downloadPanels.length; i++) {
            if (self.downloadPanels[i].url === url) {
                return self.downloadPanels[i];
            }
        }
    }

    self.__addIpcs = function() {
        electron.on('download-file-status', self.__handleDownloadStatus.bind(self));
        electron.on('download-file-started', self.__handleDownloadStarted.bind(self));
    }

    self.__handleDownloadStarted = function(_event, downloadData) {
        if (self.downloadPanels[downloadData.downloadId]) {
            // handle issue in electron-dl that trigger another download started when new one launched
            return;
        }

        var panelId = tasksPanelService.addItem(
            'Downloading ' + downloadData.filename + '...',
            {
                onAction: () => { self.cancelDownload(downloadData.downloadId); },
                tooltip: 'Cancel',
                icon: 'close-circle'
            },
            {
                onClose: null,
                disabled: true
            },
            'percent',
        );
        
        self.downloadPanels[downloadData.downloadId] = {
            panelId,
            downloadId: downloadData.downloadId,
            url: downloadData.url,
        };
    };

    self.__handleDownloadStatus = function(_event, status) {
        if (status.status === 'downloading') {
            self.__handleDownloadingStatus(status);
        } else if (status.status === 'canceled' || status.status === 'success' || status.status === 'failed') {
            self.__handleEndOfDownload(status);
        }
    };

    self.__handleDownloadingStatus = function(status) {
        var panel = self.downloadPanels[status.downloadId];
        if (panel) {
            tasksPanelService.setPercent(panel.panelId, status.percent);
        }       
    };

    self.__handleEndOfDownload = function(status) {
        if (status.status === 'canceled') {
            toast.info('Download canceled');
        } else if (status.status === 'success') {
            toast.success('Download succeed');
        } else if (status.status === 'failed') {
            toast.error('Download failed');
        }

        var panel = self.downloadPanels[status.downloadId];
        if (panel) {
            tasksPanelService.removeItem(panel.panelId);
            delete self.downloadPanels[status.downloadId];
        }
    };
}]);
