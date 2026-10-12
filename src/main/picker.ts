import path from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { PARTITION } from '../shared/constants';
import { getMainWindow } from './window';

export interface PickerSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  /** data: URL, or null when the thumbnail came back empty. */
  thumbnail: string | null;
  appIcon: string | null;
}

interface ActivePicker {
  win: BrowserWindow;
  sources: PickerSource[];
  settle: (id: string | null) => void;
}

/**
 * Fallback source picker for X11 sessions.
 *
 * On Wayland this is dead code by design — see capture.ts for why the portal
 * dialog is the picker there. It exists so the app is not broken for anyone
 * running an X11 session (or XWayland-only setup) where getSources() enumerates
 * everything with no system UI of its own.
 *
 * Only one picker can be open at a time: getDisplayMedia is user-gesture driven
 * and a second concurrent request is either a bug or an abuse attempt.
 */
let active: ActivePicker | null = null;

function isFromActivePicker(senderId: number): boolean {
  return active !== null && !active.win.isDestroyed() && senderId === active.win.webContents.id;
}

function settle(id: string | null): void {
  const current = active;
  if (!current) return;
  active = null;
  current.settle(id);
  if (!current.win.isDestroyed()) current.win.close();
}

/** Registered once at startup; the handlers are inert while no picker is open. */
export function registerPickerIpc(): void {
  ipcMain.handle('picker:get-sources', (event) => {
    if (!isFromActivePicker(event.sender.id)) throw new Error('forbidden');
    return active!.sources;
  });

  ipcMain.on('picker:choose', (event, id: unknown) => {
    if (!isFromActivePicker(event.sender.id)) return;
    // Never trust the id coming back from the renderer: only ids we actually
    // offered may be turned into a capture.
    const valid = typeof id === 'string' && active!.sources.some((s) => s.id === id);
    settle(valid ? (id as string) : null);
  });

  ipcMain.on('picker:cancel', (event) => {
    if (!isFromActivePicker(event.sender.id)) return;
    settle(null);
  });
}

/** Resolves with the chosen source id, or null if the user cancelled. */
export function pickSource(sources: PickerSource[]): Promise<string | null> {
  if (active) {
    console.warn('[picker] a picker is already open; refusing the new request');
    return Promise.resolve(null);
  }

  const parent = getMainWindow();
  const win = new BrowserWindow({
    width: 780,
    height: 580,
    parent: parent ?? undefined,
    modal: parent !== null,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Elegir qué compartir',
    backgroundColor: '#f4f5f7',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'picker.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Same partition as the app so the picker inherits the scrubbed UA and
      // does not create a second on-disk session directory.
      partition: PARTITION,
    },
  });

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const done = (id: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(id);
    };

    active = { win, sources, settle: done };

    // Closing the window by any route (Esc, title bar, compositor) counts as a
    // cancel — the promise must never be left dangling, or getDisplayMedia
    // would hang forever.
    win.on('closed', () => {
      if (active?.win === win) active = null;
      done(null);
    });

    win.once('ready-to-show', () => win.show());
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'picker.html'));
  });
}
