/**
 * Values shared between main-process modules.
 *
 * NOTE: the preload script deliberately does NOT import from here. Sandboxed
 * preloads (`sandbox: true`) run with a restricted `require` that only resolves
 * `electron` plus a handful of Node builtins — relative imports would throw at
 * runtime. Anything the preload needs is inlined there instead.
 */

/** The app we are wrapping. Everything else is treated as an external link. */
export const APP_URL = 'https://app.scre.io/#/';

/**
 * Hosts considered "inside" the app. Navigation to these stays in the window;
 * anything else is handed to the system browser.
 */
export const INTERNAL_HOSTS = ['scre.io', 'app.scre.io', 'www.scre.io'] as const;

/**
 * Persistent session partition. Keeping this stable across releases is what
 * makes localStorage/IndexedDB (and therefore the app's settings and its
 * autosaved recordings) survive restarts.
 */
export const PARTITION = 'persist:screio';

/** IPC channel names. Kept in one place so main and preload cannot drift. */
export const IPC = {
  /** Renderer -> main, offline page only: retry loading the app. */
  RETRY_CONNECTION: 'screenio:retry-connection',
  /** Renderer -> main, invoke: returns static app info. */
  GET_APP_INFO: 'screenio:get-app-info',
} as const;

/**
 * True when devtools and verbose logging should be *available*: any unpackaged
 * run, plus an explicit opt-in for packaged builds.
 */
export const isDev = (): boolean =>
  process.env.SCREIO_DEV === '1' || !require('electron').app.isPackaged;

/**
 * True only when devtools should pop open by themselves. Deliberately narrower
 * than `isDev()`: `npm start` runs unpackaged but should still look like the
 * real app, so auto-opening is gated on `npm run dev` setting SCREIO_DEV.
 */
export const isDevToolsAutoOpen = (): boolean => process.env.SCREIO_DEV === '1';

export const isLinux = (): boolean => process.platform === 'linux';
export const isWindows = (): boolean => process.platform === 'win32';

/**
 * True when running on a Wayland session (as opposed to X11/XWayland).
 * Necessarily false off Linux, where XDG_SESSION_TYPE is unset.
 */
export const isWayland = (): boolean =>
  (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland';

/**
 * How system audio reaches the page on this platform.
 *
 *  - `native-loopback`: Electron hands the page a real system-audio track via
 *    `Streams.audio = 'loopback'`. Windows only, per Electron's own typings.
 *  - `virtual-source`: no such path exists, so we publish a PipeWire source and
 *    splice it into getDisplayMedia from the page. Linux.
 *  - `unsupported`: neither is available (macOS).
 */
export type SystemAudioStrategy = 'native-loopback' | 'virtual-source' | 'unsupported';

export const systemAudioStrategy = (): SystemAudioStrategy => {
  if (isWindows()) return 'native-loopback';
  if (isLinux()) return 'virtual-source';
  return 'unsupported';
};

/** Returns the registrable host for a URL, or null if it is not parseable. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** True if `url` belongs to the wrapped app (scre.io or a subdomain). */
export function isInternalUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return INTERNAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
