import { app, ipcMain } from 'electron';
import { IPC, isInternalUrl } from '../shared/constants';

/**
 * Static, non-sensitive information the page may ask for. Every handler
 * validates the calling frame: the preload is shared with remote content, so
 * "the channel exists" is never sufficient authorisation.
 */
export function registerAppIpc(): void {
  ipcMain.handle(IPC.GET_APP_INFO, (event) => {
    const senderUrl = event.senderFrame?.url ?? '';
    const allowed = isInternalUrl(senderUrl) || senderUrl.startsWith('file://');
    if (!allowed) {
      throw new Error('forbidden');
    }
    return {
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
    };
  });
}
