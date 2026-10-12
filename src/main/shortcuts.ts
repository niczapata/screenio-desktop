import type { BrowserWindow, Input } from 'electron';
import { isDev } from '../shared/constants';

/**
 * Zoom limits, in Chromium "zoom level" units (each step is a factor of 1.2).
 * -3 ≈ 58%, +4 ≈ 207% — roughly the usable range of Chrome's own zoom menu.
 */
const ZOOM_MIN = -3;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.5;

const clamp = (n: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));

/**
 * Registers the browser keybindings people expect from a window showing a web
 * page.
 *
 * These are handled via `before-input-event` rather than an application Menu on
 * purpose: the menu would either be visible (this app has no menu bar) or, if
 * hidden, would still claim accelerators globally for the whole app. Doing it
 * per-WebContents keeps the bindings scoped to the page and lets us drop
 * devtools outside development without rebuilding a menu.
 *
 * Note that editing accelerators (copy/paste/undo/select-all) are deliberately
 * NOT handled here — Blink implements those internally for editable content, and
 * intercepting them would only get in the way.
 */
export function registerWindowShortcuts(win: BrowserWindow): void {
  const wc = win.webContents;

  wc.on('before-input-event', (event, input: Input) => {
    if (input.type !== 'keyDown') return;

    const ctrl = input.control || input.meta;
    const key = input.key;
    const consume = (fn: () => void): void => {
      event.preventDefault();
      fn();
    };

    // --- Reload -----------------------------------------------------------
    if (key === 'F5' && !input.shift) return consume(() => wc.reload());
    if ((key === 'F5' && input.shift) || (ctrl && input.shift && key.toLowerCase() === 'r')) {
      return consume(() => wc.reloadIgnoringCache());
    }
    if (ctrl && !input.shift && key.toLowerCase() === 'r') return consume(() => wc.reload());

    // --- Zoom -------------------------------------------------------------
    // '=' is the unshifted key on the '+' position; accept both, plus numpad.
    if (ctrl && (key === '+' || key === '=' || key === 'Add')) {
      return consume(() => wc.setZoomLevel(clamp(wc.getZoomLevel() + ZOOM_STEP)));
    }
    if (ctrl && (key === '-' || key === '_' || key === 'Subtract')) {
      return consume(() => wc.setZoomLevel(clamp(wc.getZoomLevel() - ZOOM_STEP)));
    }
    if (ctrl && (key === '0' || key === 'Insert')) {
      return consume(() => wc.setZoomLevel(0));
    }

    // --- Window -----------------------------------------------------------
    if (key === 'F11') {
      return consume(() => win.setFullScreen(!win.isFullScreen()));
    }
    if (key === 'Escape' && win.isFullScreen()) {
      return consume(() => win.setFullScreen(false));
    }

    // --- History ----------------------------------------------------------
    if (input.alt && key === 'ArrowLeft') {
      return consume(() => {
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
      });
    }
    if (input.alt && key === 'ArrowRight') {
      return consume(() => {
        if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
      });
    }

    // --- Devtools (development only) --------------------------------------
    if (isDev() && (key === 'F12' || (ctrl && input.shift && key.toLowerCase() === 'i'))) {
      return consume(() => wc.toggleDevTools());
    }
  });
}
