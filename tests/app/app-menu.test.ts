import { app, BrowserWindow, Menu } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { createAppMenu } from '../../src/app-menu';

describe('createAppMenu', () => {
  it('builds and applies application menu', () => {
    const send = vi.fn();
    const window = { webContents: { send } } as unknown as BrowserWindow;

    createAppMenu(window);

    expect(Menu.buildFromTemplate).toHaveBeenCalled();
    expect(Menu.setApplicationMenu).toHaveBeenCalled();
  });

  it('wires file and help menu click handlers', () => {
    const send = vi.fn();
    const window = { webContents: { send } } as unknown as BrowserWindow;
    createAppMenu(window);

    const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)?.[0] as Array<{
      label?: string;
      submenu?: Array<{ label?: string; click?: () => void; type?: string }> | unknown;
    }>;

    const fileMenu = template.find((item) => item.label === 'File');
    const helpMenu = template.find((item) => item.label === 'Help');

    const fileItems = fileMenu?.submenu as Array<{ label?: string; click?: () => void }>;
    fileItems.find((item) => item.label === 'Updates')?.click?.();
    fileItems.find((item) => item.label === 'Preferences')?.click?.();
    fileItems.find((item) => item.label === 'Quit')?.click?.();

    expect(send).toHaveBeenCalledWith('open-page', { page: 'updates' });
    expect(send).toHaveBeenCalledWith(
      'open-modal',
      expect.objectContaining({ controller: 'preferencesController' }),
    );
    expect(app.quit).toHaveBeenCalled();

    // Help submenu is itself built via Menu.buildFromTemplate
    const helpTemplateCall = vi
      .mocked(Menu.buildFromTemplate)
      .mock.calls.find((call) =>
        (call[0] as Array<{ label?: string }>).some((item) => item.label === 'Application help'),
      )?.[0] as Array<{ label?: string; click?: () => void }>;

    helpTemplateCall.find((item) => item.label === 'Application help')?.click?.();
    helpTemplateCall.find((item) => item.label === 'Get support')?.click?.();
    helpTemplateCall.find((item) => item.label === 'About')?.click?.();

    expect(send).toHaveBeenCalledWith('open-page', { page: 'help' });
    expect(send).toHaveBeenCalledWith('open-page', { page: 'support' });
    expect(send).toHaveBeenCalledWith('open-page', { page: 'about' });
    expect(helpMenu).toBeTruthy();
  });
});
