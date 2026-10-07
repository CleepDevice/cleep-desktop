/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
/**
 * Download service handle download from angularjs app handling download panels
 */
angular
.module('Cleep')
.service('downloadService', ['tasksPanelService', 'toastService', 'electronService',
function(tasksPanelService, toast, electron) {
    var self = this;
    self.downloadPanels = {};

    self._ipcReady = false;
    self._unsubscribers = [];

    self.init = function() {
        if (self._ipcReady) {
            return;
        }
        self.addIpcs();
        self._ipcReady = true;
    };

    self.destroy = function() {
        self._unsubscribers.forEach(function(unsubscribe) {
            unsubscribe();
        });
        self._unsubscribers = [];
        self._ipcReady = false;
    };

    self.downloadUrl = function(url) {
        if (this.isDownloadWithUrl(url)) {
            toast.warning('File is already downloading');
            return;
        }
        electron.download.start({ url, title: 'Download file from device' });
    }

    self.isDownloadWithUrl = function(url) {
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
            tasksPanelService.removePanel(panel.panelId);
            delete self.downloadPanels[downloadId];
        }
        electron.download.cancel(downloadId);
    };

    self.addIpcs = function() {
        self._unsubscribers.push(
            electron.download.onStarted(self.onHandleDownloadStarted.bind(self)),
            electron.download.onStatus(self.onHandleDownloadStatus.bind(self)),
        );
    };

    self.onHandleDownloadStarted = function(_event, downloadData) {
        if (self.downloadPanels[downloadData.downloadId]) {
            // handle issue in electron-dl that trigger another download started when new one launched
            return;
        }

        var panelId = tasksPanelService.addPanel(
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

    self.onHandleDownloadStatus = function(_event, status) {
        if (status.status === 'downloading') {
            self.handleDownloadingStatus(status);
        } else if (status.status === 'canceled' || status.status === 'success' || status.status === 'failed') {
            self.handleEndOfDownload(status);
        }
    };

    self.handleDownloadingStatus = function(status) {
        var panel = self.downloadPanels[status.downloadId];
        if (panel) {
            tasksPanelService.setPercent(panel.panelId, status.percent);
        }       
    };

    self.handleEndOfDownload = function(status) {
        if (status.status === 'canceled') {
            toast.info('Download canceled');
        } else if (status.status === 'success') {
            toast.success('Download succeed');
        } else if (status.status === 'failed') {
            toast.error('Download failed');
        }

        var panel = self.downloadPanels[status.downloadId];
        if (panel) {
            tasksPanelService.removePanel(panel.panelId);
            delete self.downloadPanels[status.downloadId];
        }
    };
}]);
