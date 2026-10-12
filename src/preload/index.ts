/**
 * Preload — the entire trusted surface exposed to remote content.
 *
 * Two constraints shape this file:
 *
 *  1. It runs sandboxed (`sandbox: true`). A sandboxed preload gets a
 *     restricted `require` that resolves `electron` and a few Node builtins and
 *     nothing else — in particular it cannot import our own modules. That is
 *     why the channel names below are inlined rather than imported from
 *     shared/constants.ts. If you change them there, change them here.
 *
 *  2. It is injected into app.scre.io, which is third-party code. Nothing here
 *     may hand out `ipcRenderer` itself, a Node API, or any function that lets
 *     the page name its own IPC channel. Each exposed method is a fixed verb on
 *     a fixed channel, and the main process re-validates the calling frame —
 *     the preload's job is to narrow the surface, not to authorise it.
 */
import { contextBridge, ipcRenderer } from 'electron';

const CHANNELS = {
  RETRY_CONNECTION: 'screenio:retry-connection',
  GET_APP_INFO: 'screenio:get-app-info',
} as const;

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
}

const api = {
  /** Static build info. Rejects if called from an unexpected origin. */
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(CHANNELS.GET_APP_INFO),

  /**
   * Ask the main process to re-load the app. Honoured only when the calling
   * frame is our own offline page; see offline.ts.
   */
  retryConnection: (): void => {
    ipcRenderer.send(CHANNELS.RETRY_CONNECTION);
  },
} as const;

contextBridge.exposeInMainWorld('screenio', api);
