import { shell, type BrowserWindow, type WebContents } from 'electron';
import { isInternalUrl } from '../shared/constants';

/**
 * Only these schemes are ever handed to `shell.openExternal`. Without this
 * check, a hostile or compromised page could hand us `file://`, `smb://` or a
 * registered custom scheme and get the desktop to open it.
 */
const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

function openExternally(url: string): void {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return;
  }
  if (!EXTERNAL_SCHEMES.has(protocol)) {
    console.warn(`[navigation] refused to open external URL with scheme ${protocol}`);
    return;
  }
  void shell.openExternal(url);
}

/**
 * Browser-like link handling:
 *
 *  - `window.open` / target=_blank to a scre.io URL opens a real popup window,
 *    because the app uses popups for parts of its own flow.
 *  - Anything else goes to the system browser. This is what keeps us from
 *    accumulating orphan Electron windows with no chrome and no way back.
 *  - Top-level navigation away from scre.io is cancelled and redirected to the
 *    system browser too, so a stray link cannot turn the app window into a
 *    general-purpose browser.
 *
 * Caveat worth knowing: if scre.io ever adds third-party OAuth (Google, etc.),
 * the sign-in popup would be an external origin and would land in the system
 * browser, breaking the flow. Scre.io currently has no login, so this is not a
 * live problem — but that is the line to revisit if one appears.
 */
export function applyNavigationPolicy(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          // Popups inherit the parent's webPreferences, but be explicit: a
          // popup must never be more privileged than the main window.
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
        },
      };
    }
    openExternally(url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return;
    // file:// is our own offline page; leave it alone.
    if (url.startsWith('file://')) return;
    event.preventDefault();
    openExternally(url);
  });

  // Remote content has no business attaching a webview.
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

export function applyNavigationPolicyToWindow(win: BrowserWindow): void {
  applyNavigationPolicy(win.webContents);
}
