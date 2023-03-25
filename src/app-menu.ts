import { app, BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron';
import isDev from 'electron-is-dev';

export function createAppMenu(window: BrowserWindow): void {
  const subMenuFile: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'Updates',
        click: () => {
          window.webContents.send('open-page', { page: 'updates' });
        },
      },
      {
        label: 'Preferences',
        click: () => {
          window.webContents.send('open-modal', {
            controller: 'preferencesController',
            template: 'js/preferences/preferences-dialog.html',
          });
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          app.quit();
        },
      },
    ],
  };

  const subMenuEdit: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
  };

  // const subMenuDevice: MenuItemConstructorOptions = {
  //     label: 'Device',
  //     submenu: Menu.buildFromTemplate([
  //         {
  //             label: 'Install',
  //             click: () => {
  //                 window.webContents.send('open-page', { page: 'installAuto' });
  //             }
  //         }, {
  //             type: 'separator'
  //         }, {
  //             label: 'Monitoring',
  //             click: () => {
  //                 window.webContents.send('open-page', { page: 'monitoring' });
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
          window.webContents.send('open-page', { page: 'help' });
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Get support',
        click: () => {
          window.webContents.send('open-page', { page: 'support' });
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'About',
        click: () => {
          window.webContents.send('open-page', { page: 'about' });
        },
      },
    ]),
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
      { role: 'togglefullscreen' },
    ],
  };

  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    subMenuFile,
    ...(isMac ? [subMenuEdit] : []),
    subMenuHelp,
    ...(isDev ? [subMenuView] : []),
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
