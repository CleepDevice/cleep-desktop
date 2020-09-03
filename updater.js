/**
 * CleepDesktop updater
 */
const { logger } = require('./log');

const CHECK_FOR_UPDATE = 'check-for-update';
const CHECK_FOR_UPDATE_SUCCESS = 'check-for-update-success';
const CHECK_FOR_UPDATE_FAILURE = 'check-for-update-failure';
const DOWNLOAD_UPDATE = 'download-update';
const DOWNLOAD_PERCENT = 'download-percent';
const DOWNLOAD_UPDATE_SUCCESS = 'download-update-success';
const DOWNLOAD_UPDATE_FAILURE = 'download-update-failure';
const QUIT_AND_INSTALL = 'quit-and-install';

class CleepDesktopUpdater {
    constructor(autoUpdater, ipcMain, logger) {
        this.autoUpdater = autoUpdater;
        this.ipcMain = ipcMain;
        this.downloadPercent = 0;
        this.updateChangelog = null;

        // set logger
        this.autoUpdater.logger = logger;

        // update check must be triggered by frontend only (it means it is ready for updates)
        this.autoUpdater.autoDownload = false;

        // enable this flag to allow pre release
        // this.autoUpdater.allowPrerelease = true;

        // this.addHandlers();
    }

    addHandlers() {
        // replace autoUpdater.addListener('update-available') which is triggered automatically at updater
        // startup but frontend may be not available to receive events.
        ipcMain.on(CHECK_FOR_UPDATE, event => {
            const { sender } = event;

            this.autoUpdater.checkForUpdates()
                .then((checkResult) => {
                    const { updateInfo } = checkResult;
                    sender.send(CHECK_FOR_UPDATE_SUCCESS, updateInfo);
                })
                .catch(() => {
                    sender.send(CHECK_FOR_UPDATE_FAILURE);
                });
        });

        ipcMain.on(DOWNLOAD_UPDATE, event => {
            const { sender } = event;

            this.autoUpdater.downloadUpdate()
                .then(() => {
                    sender.send(DOWNLOAD_UPDATE_SUCCESS);
                })
                .catch(() => {
                    sender.send(DOWNLOAD_UPDATE_FAILURE);
                })
        });

        this.autoUpdater.addListener('download-progress', (progress) => {
            this.downloadPercent = Math.round(progress.percent);
        });

        this.autoUpdater.addListener('update-available', (info) => {
            if( info && info.releaseNotes ) {
                logger.debug('Received update changelog', changelog);
                this.updateChangelog = info.releaseNotes;
            }
        });
    }
}

module.exports = {
    CleepDesktopUpdater,
    CHECK_FOR_UPDATE,
    CHECK_FOR_UPDATE_SUCCESS,
    CHECK_FOR_UPDATE_FAILURE,
    DOWNLOAD_UPDATE,
    DOWNLOAD_PERCENT,
    DOWNLOAD_UPDATE_SUCCESS,
    DOWNLOAD_UPDATE_FAILURE,
    QUIT_AND_INSTALL,
}
