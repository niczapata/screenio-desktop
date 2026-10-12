import { desktopCapturer, type DesktopCapturerSource, type Session } from 'electron';
import { isDev, isWayland, systemAudioStrategy } from '../shared/constants';
import { pickSource } from './picker';
import { warnSystemAudioUnavailable } from './notify';
import { getUnavailableReason, isRunning } from './systemAudio';

/**
 * Screen capture.
 *
 * The one thing worth understanding before touching this file: on Wayland there
 * is no list of sources to choose from in-process. Chromium's PipeWire backend
 * implements `desktopCapturer.getSources()` by opening the
 * xdg-desktop-portal ScreenCast dialog, letting the *compositor* run the
 * picker, and returning only whatever the user selected. So:
 *
 *   - The portal dialog is not something we request with a flag. It is the
 *     direct consequence of calling getSources(). This is also exactly how
 *     Chrome behaves, which is the parity we are after.
 *
 *   - `useSystemPicker` does NOT do this. In Electron 44 it is typed
 *     `_macOS_ _Experimental_` and is ignored on Linux; passing it here would be
 *     cargo cult. We do not pass it.
 *
 *   - Because the portal returns the user's single choice, getSources() yields
 *     at most one entry on Wayland (Electron documents this explicitly). A
 *     thumbnail picker of our own would therefore have to open the portal first
 *     and then show a grid of exactly one item — worse than useless. Our picker
 *     is the X11 path only.
 */

/** Only the wrapped app may capture the screen. */
const ALLOWED_ORIGINS = new Set(['https://app.scre.io', 'https://scre.io']);

/**
 * Wayland: no thumbnails are needed (the portal already showed a live preview),
 * and requesting them costs a needless frame grab per source.
 */
const NO_THUMBNAIL = { width: 0, height: 0 };
const PICKER_THUMBNAIL = { width: 320, height: 180 };

function isAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin.replace(/\/$/, ''));
}

export function installDisplayMediaHandler(ses: Session): void {
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isAllowed(request.securityOrigin)) {
      console.warn(`[capture] denied display-capture for origin ${request.securityOrigin}`);
      return callback({});
    }

    // Scre.io's "Sistema" option makes it call getDisplayMedia({ audio: true }).
    // We cannot satisfy that here — `Streams.audio` only takes `loopback`
    // (Windows) or a WebFrameMain — so the audio track is attached in the page
    // instead, by the shim in audioShim.ts, from the virtual PipeWire source.
    // All this handler has to do is notice when that source is down and say so,
    // rather than let the user find out from a recording with no sound.
    const audioStrategy = systemAudioStrategy();
    if (request.audioRequested && audioStrategy === 'virtual-source' && !isRunning()) {
      warnSystemAudioUnavailable(getUnavailableReason());
    }
    if (request.audioRequested && audioStrategy === 'unsupported') {
      warnSystemAudioUnavailable('Esta plataforma no permite capturar el audio del sistema.');
    }

    if (!request.videoRequested) {
      // Audio-only display capture is meaningless here; there is nothing we
      // could return that the page would accept.
      return callback({});
    }

    try {
      // Wayland is the only backend with a system picker of its own. On X11 and
      // on Windows getSources() enumerates everything silently, so our picker is
      // what the user actually chooses from.
      const via = isWayland() ? 'wayland/portal' : 'own-picker';
      if (isDev()) console.log(`[capture] requesting a source via ${via}`);

      const source = isWayland() ? await selectViaPortal() : await selectViaOwnPicker();
      if (isDev()) {
        console.log(
          source
            ? `[capture] granted: id=${source.id} name=${JSON.stringify(source.name)}`
            : '[capture] cancelled by user',
        );
      }
      if (!source) {
        // User dismissed the portal or our picker. An empty Streams object is
        // how Electron signals "denied"; the page sees the same NotAllowedError
        // it would get from cancelling Chrome's picker.
        return callback({});
      }
      // Windows is the one platform where the main process can supply system
      // audio directly. On Linux the track is attached in the page instead, by
      // the shim in audioShim.ts — see systemAudio.ts for why.
      if (request.audioRequested && audioStrategy === 'native-loopback') {
        return callback({ video: source, audio: 'loopback' });
      }
      callback({ video: source });
    } catch (err) {
      console.error('[capture] failed to obtain a source:', err);
      callback({});
    }
  });
}

/**
 * Wayland path. Calling getSources() opens the portal dialog; the promise
 * settles once the user has chosen or cancelled.
 *
 * Both types are requested so the portal offers screens *and* windows. Note
 * that PipeWire performs a single capture for both, so when the user picks a
 * window the entry comes back typed as a window capture — that is expected, not
 * an error to correct.
 */
async function selectViaPortal(): Promise<DesktopCapturerSource | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: NO_THUMBNAIL,
    fetchWindowIcons: false,
  });
  return sources[0] ?? null;
}

/**
 * X11 path. Here getSources() really does enumerate everything without any
 * system UI, so we have to supply the picker ourselves.
 */
async function selectViaOwnPicker(): Promise<DesktopCapturerSource | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: PICKER_THUMBNAIL,
    fetchWindowIcons: true,
  });
  if (sources.length === 0) return null;

  const chosenId = await pickSource(
    sources.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith('screen:') ? ('screen' as const) : ('window' as const),
      thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
    })),
  );

  return sources.find((s) => s.id === chosenId) ?? null;
}
