/**
 * Preload for the X11 source picker window.
 *
 * Deliberately a separate file from the main preload: these channels give the
 * caller a way to start a screen capture, and nothing resembling that should be
 * reachable from app.scre.io's page context. The picker's renderer is our own
 * local HTML, so this surface is only ever exposed to code we wrote.
 *
 * Like the main preload, this runs sandboxed and therefore cannot import from
 * ../shared.
 */
import { contextBridge, ipcRenderer } from 'electron';

export interface PickerSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string | null;
  appIcon: string | null;
}

contextBridge.exposeInMainWorld('picker', {
  getSources: (): Promise<PickerSource[]> => ipcRenderer.invoke('picker:get-sources'),
  choose: (id: string): void => {
    ipcRenderer.send('picker:choose', id);
  },
  cancel: (): void => {
    ipcRenderer.send('picker:cancel');
  },
});
