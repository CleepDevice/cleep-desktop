import { app } from 'electron';
import settings from 'electron-settings';
/* eslint-disable  @typescript-eslint/no-explicit-any */
(<any>global).settings = settings;

const DEFAULT_SETTINGS: {[k: string]: string | number | boolean| {[k: string]: string}} = {
    rpcPort: 5610,
    debug: false,
    isoRaspbian: false,
    isoLocal: false,
    locale: 'en',
    proxyMode: 'noproxy',
    proxyHost: 'localhost',
    proxyPort: 8080,
    crashReport: true,
    firstRun: true,
    devices: {},
}

// copied from electron-settings that not exports those types
export type SettingsObject = {
    [key: string]: SettingsValue;
};
export type SettingsValue = null | boolean | string | number | SettingsObject | SettingsValue[];
export type KeyPath = string | Array<string | number>;

export class AppSettings {
    constructor(isDev: boolean) {
        settings.configure({prettify: true})
        this.checkAndFixConfig(isDev)
    }

    public get(keyPath: KeyPath): SettingsValue {
        return settings.getSync(keyPath);
    }

    public set(keyPath: KeyPath, value: SettingsValue): void {
        settings.setSync(keyPath, value);
    }

    public has(keyPath: KeyPath): boolean {
        return settings.hasSync(keyPath);
    }

    public filepath(): string {
        return settings.file();
    }

    private checkAndFixConfig(isDev: boolean) {
        // cleep
        if(isDev) {
            settings.setSync('cleep.version', require('./package.json').version);
        } else {
            settings.setSync('cleep.version', app.getVersion());
        }
        if( !settings.hasSync('cleep.isoraspbian') ) {
            settings.setSync('cleep.isoraspbian', DEFAULT_SETTINGS.isoRaspbian);
        }
        if( !settings.hasSync('cleep.isolocal') ) {
            settings.setSync('cleep.isolocal', DEFAULT_SETTINGS.isoLocal);
        }
        if( !settings.hasSync('cleep.locale') ) {
            settings.setSync('cleep.locale', DEFAULT_SETTINGS.locale);
        }
        if( !settings.hasSync('cleep.debug') ) {
            settings.setSync('cleep.debug', DEFAULT_SETTINGS.debug);
        }
        settings.setSync('cleep.isdev', isDev);
        if( !settings.hasSync('cleep.crashreport') ) {
            settings.setSync('cleep.crashreport', DEFAULT_SETTINGS.crashReport);
        }
    
        // balena
        if( !settings.hasSync('etcher.version') ) {
            settings.setSync('etcher.version', 'v0.0.0');
        }
    
        // remote
        if( !settings.hasSync('remote.rpcport') ) {
            settings.setSync('remote.rpcport', DEFAULT_SETTINGS.rpcPort);
        }
    
        // proxy
        if( !settings.hasSync('proxy.mode') ) {
            settings.setSync('proxy.mode', DEFAULT_SETTINGS.proxyMode);
        }
        if( !settings.hasSync('proxy.host') ) {
            settings.setSync('proxy.host', DEFAULT_SETTINGS.proxyHost);
        }
        if( !settings.hasSync('proxy.port') ) {
            settings.setSync('proxy.port', DEFAULT_SETTINGS.proxyPort);
        }
    
        // firstrun
        if( !settings.hasSync('cleep.firstrun') ) {
            settings.setSync('cleep.firstrun', DEFAULT_SETTINGS.firstRun);
        }
    
        // devices
        if( !settings.hasSync('devices') ) {
            settings.setSync('devices', DEFAULT_SETTINGS.devices);
        }
    }
}
