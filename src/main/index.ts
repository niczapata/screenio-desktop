import { app } from 'electron';
import { isDev } from '../shared/constants';
import { scrubUserAgent } from './useragent';
import { appSession, createMainWindow, focusMainWindow, getMainWindow } from './window';
import { registerOfflineIpc } from './offline';
import { registerAppIpc } from './ipc';
import { installHiddenEditMenu } from './menu';
import { installDisplayMediaHandler } from './capture';
import { registerPickerIpc } from './picker';
import { startSystemAudioSource, stopSystemAudioSource } from './systemAudio';

// Must be set before anything derives paths or the UA from it.
app.setName('Scre.io');

/**
 * One window, one session. A second launch (from the launcher, or a file
 * manager) focuses the existing window instead of starting a rival instance
 * that would fight over the same persistent partition.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => focusMainWindow());

  void app.whenReady().then(() => {
    const ses = appSession();

    // Strip Electron's fingerprint from the UA before the first request goes
    // out. See useragent.ts for why this is a parity requirement.
    const scrubbed = scrubUserAgent(ses.getUserAgent(), app.getName());
    ses.setUserAgent(scrubbed);
    if (isDev()) console.log(`[ua] ${scrubbed}`);

    installHiddenEditMenu();
    registerAppIpc();
    registerOfflineIpc(getMainWindow);
    registerPickerIpc();

    // Screen capture. Must be installed on the same partition the window uses.
    installDisplayMediaHandler(ses);

    // Publish the virtual system-audio source before the window loads, so the
    // device already exists the first time the page enumerates inputs.
    startSystemAudioSource();

    createMainWindow();

    app.on('activate', () => {
      if (!getMainWindow()) createMainWindow();
    });
  });

  // The virtual source is a child process; make sure it goes away with us on
  // every exit path, not just a clean window close.
  app.on('will-quit', () => stopSystemAudioSource());
  process.on('exit', () => stopSystemAudioSource());

  app.on('window-all-closed', () => {
    // Phase 4 introduces "close to tray"; until then, closing the window quits.
    if (process.platform !== 'darwin') app.quit();
  });
}

// TODO(phase 3): install setPermissionRequestHandler / setPermissionCheckHandler.
// Until that lands, Electron's permissive defaults are in effect for this
// session — acceptable mid-build, not acceptable in a release.
