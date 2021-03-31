import fs from 'fs'
import path from "path";
import { AppSettings } from './app-settings';
import { DownloadItem } from 'electron';

class AppContext {
    public allowQuit = false;
    public closingApplication = false;
    public rpcPort = 0;
    public coreDisabled = false;
    public isDev: boolean;
    public coreProcess: any;
    public settings: AppSettings;
    public changelog: string;
    public download: DownloadItem; // TODO handle multiple files ?

    constructor() {
        this.isDev = fs.existsSync(path.join(__dirname, 'cleepdesktopcore.py'));
        this.settings = new AppSettings(this.isDev);
    }
}

export const appContext = new AppContext();
