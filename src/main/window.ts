import path from 'node:path';
import { BrowserWindow, session, type Session } from 'electron';
import { APP_URL, PARTITION, isDevToolsAutoOpen } from '../shared/constants';
import { applyNavigationPolicyToWindow } from './navigation';
import { registerWindowShortcuts } from './shortcuts';
import { attachOfflineHandling, setPendingUrl } from './offline';
import { installSystemAudioShim } from './audioShim';

let mainWindow: BrowserWindow | null = null;

export const getMainWindow = (): BrowserWindow | null =>
  mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;

/** The persistent session everything in this app shares. */
export const appSession = (): Session => session.fromPartition(PARTITION);

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 560,
    minHeight: 480,
    // Painting the window in the app's own background colour avoids the white
    // flash between window creation and first paint.
    backgroundColor: '#f4f5f7',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      // --- Security baseline. None of these are defaults worth relaxing: the
      // window shows remote third-party content we do not control.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Share the persistent partition so cookies, localStorage and IndexedDB
      // (where scre.io keeps its settings and autosaved recordings) survive
      // restarts.
      partition: PARTITION,
      // Chrome autoplays media in a user-activated tab; match that, otherwise
      // recording previews need a click to start.
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });

  mainWindow = win;

  applyNavigationPolicyToWindow(win);
  registerWindowShortcuts(win);
  attachOfflineHandling(win);
  installSystemAudioShim(win.webContents);

  // Track the last real app URL so the offline page's retry returns there.
  win.webContents.on('did-navigate', (_e, url) => {
    if (!url.startsWith('file://')) setPendingUrl(url);
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });

  void win.loadURL(APP_URL);

  if (isDevToolsAutoOpen()) win.webContents.openDevTools({ mode: 'detach' });

  return win;
}

/** Focus an existing window, restoring it if minimised. Used by second-instance. */
export function focusMainWindow(): void {
  const win = getMainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

export { appSession as getAppSession };
