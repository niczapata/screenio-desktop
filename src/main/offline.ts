import path from 'node:path';
import { ipcMain, type BrowserWindow } from 'electron';
import { APP_URL, IPC } from '../shared/constants';

export const OFFLINE_PAGE = path.join(__dirname, '..', 'renderer', 'offline.html');

/**
 * Chromium error codes that mean "the network is not reachable" rather than
 * "the server said no". Only these swap in our own page; an HTTP 500 from
 * scre.io should still show whatever scre.io sent, exactly as Chrome would.
 *
 * -3 (ERR_ABORTED) is excluded on purpose: it fires during normal in-app
 * navigation and on a reload that supersedes a pending load.
 */
const NETWORK_ERRORS = new Set([
  -2, // ERR_FAILED
  -7, // ERR_TIMED_OUT
  -21, // ERR_NETWORK_CHANGED
  -100, // ERR_CONNECTION_CLOSED
  -101, // ERR_CONNECTION_RESET
  -102, // ERR_CONNECTION_REFUSED
  -105, // ERR_NAME_NOT_RESOLVED
  -106, // ERR_INTERNET_DISCONNECTED
  -109, // ERR_ADDRESS_UNREACHABLE
  -118, // ERR_CONNECTION_TIMED_OUT
  -130, // ERR_PROXY_CONNECTION_FAILED
]);

/** Last app URL we were asked to show, so "retry" returns where you were. */
let pendingUrl = APP_URL;

export function attachOfflineHandling(win: BrowserWindow): void {
  const wc = win.webContents;

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (!NETWORK_ERRORS.has(errorCode)) return;
    if (validatedURL.startsWith('file://')) return; // our own page failed; don't loop

    if (validatedURL) pendingUrl = validatedURL;
    console.warn(`[offline] ${errorCode} ${errorDescription} for ${validatedURL}`);
    void wc.loadFile(OFFLINE_PAGE);
  });
}

/**
 * The offline page is the only caller allowed to trigger a retry, so the
 * handler checks the sender frame's URL rather than trusting the channel. The
 * remote app shares this preload, and nothing it does should be able to drive
 * main-process navigation.
 */
export function registerOfflineIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.on(IPC.RETRY_CONNECTION, (event) => {
    const senderUrl = event.senderFrame?.url ?? '';
    if (!senderUrl.startsWith('file://') || !senderUrl.includes('offline.html')) {
      console.warn(`[offline] rejected retry from unexpected frame: ${senderUrl}`);
      return;
    }
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    void win.webContents.loadURL(pendingUrl);
  });
}

export function setPendingUrl(url: string): void {
  pendingUrl = url;
}
