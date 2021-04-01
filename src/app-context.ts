import { AppSettings } from './app-settings';
import { app, DownloadItem } from 'electron';
import isDev from 'electron-is-dev';
(<any>global).isDev = isDev;

class AppContext {
    public allowQuit = true;
    public closingApplication = false;
    public rpcPort = 0;
    public coreDisabled = false;
    public isDev: boolean;
    public coreProcess: any;
    public settings: AppSettings;
    public changelog: string;
    public download: DownloadItem; // TODO handle multiple files ?
    public version: string;

    constructor() {
        this.isDev = isDev;
        if(this.isDev) {
            this.version = require('./package.json').version;
        } else {
            this.version = app.getVersion();
        }
        this.settings = new AppSettings(this.isDev);
    }
}

export const appContext = new AppContext();
(<any>global).appContext = appContext;
