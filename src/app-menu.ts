import { app, BrowserWindow, Menu, MenuItemConstructorOptions } from "electron";
import { appContext } from "./app-context";

export function createAppMenu(window: BrowserWindow): void {
    const subMenuFile: MenuItemConstructorOptions = {
        label: 'File',
        submenu: [
            {
                label: 'Updates',
                click: () => {
                    window.webContents.send('openpage', 'updates');
                }
            }, {
                label: 'Preferences',
                click: () => {
                    window.webContents.send(
                        'openmodal',
                        'preferencesController',
                        'js/preferences/preferences-dialog.html'
                    );
                }
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'CmdOrCtrl+Q',
                click: () => {
                    app.quit();
                }
            }
        ]
    };

    const subMenuEdit: MenuItemConstructorOptions = {
        label: 'Edit',
        submenu: [
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
        ]
    }

    // const subMenuDevice: MenuItemConstructorOptions = {
    //     label: 'Device',
    //     submenu: Menu.buildFromTemplate([
    //         {
    //             label: 'Install',
    //             click: () => {
    //                 window.webContents.send('openpage', 'installAuto');
    //             }
    //         }, {
    //             type: 'separator'
    //         }, {
    //             label: 'Monitoring',
    //             click: () => {
    //                 window.webContents.send('openpage', 'monitoring');
    //             }
    //         }
    //     ])
    // };

    const subMenuHelp: MenuItemConstructorOptions = {
        label: 'Help',
        submenu: Menu.buildFromTemplate([
            {
                label: 'Application help',
                click: () => {
                    window.webContents.send('openpage', 'help');
                }
            }, {
                type: 'separator'
            }, {
                label: 'Get support',
                click: () => {
                    window.webContents.send('openpage', 'support');
                }
            }, {
                type: 'separator'
            }, {
                label: 'About',
                click: () => {
                    window.webContents.send('openpage', 'about');
                }
            }
        ])
    };

    const subMenuView: MenuItemConstructorOptions = {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    };

    const isMac = process.platform === 'darwin'
    const template: MenuItemConstructorOptions[] = [
        subMenuFile,
        ...(isMac ? [subMenuEdit] : []),
        subMenuHelp,
        ...(appContext.isDev ? [subMenuView] : [])
    ]
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}
