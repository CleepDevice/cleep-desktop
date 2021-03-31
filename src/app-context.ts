import { AppSettings } from './app-settings';
import { DownloadItem } from 'electron';
import isDev from 'electron-is-dev';
const appVersion = require('./package.json').version;

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
    public version = appVersion;

    constructor() {
        this.isDev = isDev;
        this.settings = new AppSettings(this.isDev);
    }
}

export const appContext = new AppContext();
(<any>global).appContext = appContext;
