/**
 * Download service - progress shown in the left toolbar task slot.
 * No dedicated page: click cancels while running, dismisses when finished.
 */
angular
.module('Cleep')
.service('downloadService', ['toolbarTaskService', 'toastService', 'electronService', 'ipcLifecycle',
function(toolbarTask, toast, electron, ipcLifecycle) {
    var self = this;
    self.downloads = {};

    self.downloadUrl = function(url) {
        if (this.isDownloadWithUrl(url)) {
            toast.warning('File is already downloading');
            return;
        }
        electron.download.start({ url, title: 'Download file from device' });
    };

    self.isDownloadWithUrl = function(url) {
        for (var item of Object.values(self.downloads)) {
            if (item.url === url) {
                return true;
            }
        }
        return false;
    };

    self.cancelDownload = function(downloadId) {
        if (self.downloads[downloadId]) {
            delete self.downloads[downloadId];
            toolbarTask.clear('download-' + downloadId);
        }
        electron.download.cancel(downloadId);
    };

    self.addIpcs = function() {
        self._unsubscribers.push(
            electron.download.onStarted(self.onHandleDownloadStarted.bind(self)),
            electron.download.onStatus(self.onHandleDownloadStatus.bind(self)),
        );
    };

    ipcLifecycle.attach(self, self.addIpcs);

    self.onHandleDownloadStarted = function(_event, downloadData) {
        if (self.downloads[downloadData.downloadId]) {
            return;
        }

        var taskId = 'download-' + downloadData.downloadId;
        self.downloads[downloadData.downloadId] = {
            downloadId: downloadData.downloadId,
            url: downloadData.url,
            filename: downloadData.filename,
        };

        toolbarTask.set(taskId, {
            page: null,
            label: 'Download...',
            title: 'Downloading ' + downloadData.filename,
            status: 'running',
            percent: 0,
            onClick: function() {
                self.cancelDownload(downloadData.downloadId);
            },
        });
    };

    self.onHandleDownloadStatus = function(_event, status) {
        if (status.status === 'downloading') {
            self.handleDownloadingStatus(status);
        } else if (status.status === 'canceled' || status.status === 'success' || status.status === 'failed') {
            self.handleEndOfDownload(status);
        }
    };

    self.handleDownloadingStatus = function(status) {
        if (!self.downloads[status.downloadId]) {
            return;
        }
        var taskId = 'download-' + status.downloadId;
        toolbarTask.set(taskId, {
            label: 'Download...',
            title: 'Downloading... ' + Math.round(status.percent || 0) + '%',
            status: 'running',
            percent: status.percent || 0,
            onClick: function() {
                self.cancelDownload(status.downloadId);
            },
        });
    };

    self.handleEndOfDownload = function(status) {
        var taskId = 'download-' + status.downloadId;
        if (status.status === 'canceled') {
            toast.info('Download canceled');
            toolbarTask.clear(taskId);
            delete self.downloads[status.downloadId];
            return;
        }
        if (status.status === 'success') {
            toast.success('Download succeed');
            toolbarTask.set(taskId, {
                label: 'Download done',
                title: 'Download finished - click to dismiss',
                status: 'success',
                percent: 100,
                onClick: function() {
                    toolbarTask.clear(taskId);
                    delete self.downloads[status.downloadId];
                },
            });
            return;
        }
        if (status.status === 'failed') {
            toast.error('Download failed');
            toolbarTask.set(taskId, {
                label: 'Download failed',
                title: 'Download failed - click to dismiss',
                status: 'error',
                percent: 100,
                onClick: function() {
                    toolbarTask.clear(taskId);
                    delete self.downloads[status.downloadId];
                },
            });
        }
    };
}]);
