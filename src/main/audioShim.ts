import type { WebContents } from 'electron';
import { systemAudioStrategy } from '../shared/constants';
import { DEVICE_LABEL } from './systemAudio';

/**
 * Makes scre.io's "Sistema" / "Sistema + Mic." audio options actually work.
 *
 * Background: scre.io calls `getDisplayMedia({video: true, audio: true})` and
 * then checks the result with, from its own bundle:
 *
 *     const e = n.getAudioTracks();
 *     if (0 === e.length) throw new Error("audioTracks length is zero");
 *
 * On Linux Chromium never puts an audio track on that stream, so the check
 * throws and the app shows "Pista de audio del sistema no encontrada". Nothing
 * the main process can do fixes this: `Streams.audio` only accepts `loopback`
 * (Windows) or a WebFrameMain, neither of which is a capture device.
 *
 * So we patch the API in the page instead. The shim lets the real call happen
 * (the portal dialog still runs, unchanged), and if the platform came back
 * without an audio track we attach one taken from the virtual PipeWire source
 * that systemAudio.ts publishes. scre.io receives a stream that satisfies its
 * own check and is otherwise identical.
 *
 * "Sistema + Mic." needs nothing extra: scre.io already mixes the microphone in
 * itself with WebAudio (`createMediaStreamSource` / `createMediaStreamDestination`
 * appear in its bundle), so supplying the system track is sufficient.
 *
 * Three deliberate properties:
 *
 *  - It defers to the platform. If the real getDisplayMedia ever returns audio
 *    — a future Chromium, or a portal that grows audio support — the shim sees
 *    a non-empty track list and gets out of the way permanently.
 *  - It degrades to current behaviour. Any failure (no virtual source, denied
 *    permission, device gone) returns the untouched stream, and scre.io shows
 *    the same error it shows today. It never makes things worse than not
 *    having the shim.
 *  - It is idempotent, so re-injecting after a navigation is harmless.
 *
 * This must run in the page's main world, which is why it is injected via
 * `webContents.executeJavaScript` from the main process rather than from the
 * preload: with contextIsolation the preload has its own `navigator`, and
 * patching that would have no effect on scre.io's code.
 */
function buildShimSource(label: string): string {
  return `(() => {
  if (window.__screioSystemAudioShim) return 'already-installed';
  const LABEL = ${JSON.stringify(label)};
  const md = navigator.mediaDevices;
  if (!md || typeof md.getDisplayMedia !== 'function') return 'unsupported';

  const realGetDisplayMedia = md.getDisplayMedia.bind(md);

  // Device labels are hidden until microphone permission has been granted, so
  // a first pass may legitimately find nothing. In that case take the
  // permission (our session grants it to this origin) and look again.
  async function findSystemAudioDeviceId() {
    const match = (list) => list.find((d) => d.kind === 'audioinput' && d.label === LABEL);

    let found = match(await md.enumerateDevices());
    if (found) return found.deviceId;

    let unlock = null;
    try {
      unlock = await md.getUserMedia({ audio: true });
      found = match(await md.enumerateDevices());
    } catch (err) {
      return null;
    } finally {
      if (unlock) unlock.getTracks().forEach((t) => t.stop());
    }
    return found ? found.deviceId : null;
  }

  md.getDisplayMedia = async function (constraints) {
    const wantedAudio = !!(constraints && constraints.audio);
    const stream = await realGetDisplayMedia(constraints);

    if (!wantedAudio) return stream;
    // The platform supplied audio on its own; leave everything alone.
    if (stream.getAudioTracks().length > 0) return stream;

    try {
      const deviceId = await findSystemAudioDeviceId();
      if (!deviceId) return stream;

      const sys = await md.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          // This is a clean digital loopback, not a room mic. Chromium's voice
          // processing would pump and duck the program audio for no reason.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const track = sys.getAudioTracks()[0];
      if (!track) return stream;
      stream.addTrack(track);

      // When the capture ends (user stops sharing via the portal), release the
      // audio device too, otherwise the loopback stays open forever.
      const video = stream.getVideoTracks()[0];
      if (video) video.addEventListener('ended', () => track.stop(), { once: true });
    } catch (err) {
      console.warn('[screio-wrapper] could not attach system audio:', err);
    }

    return stream;
  };

  window.__screioSystemAudioShim = true;
  return 'installed';
})()`;
}

/**
 * Injects the shim and keeps it installed across navigations. Injection is
 * cheap and guarded, so running it on both events costs nothing and closes the
 * window where a reload could leave the page unpatched.
 */
export function installSystemAudioShim(contents: WebContents): void {
  // Only the virtual-source platforms need patching. On Windows the main
  // process attaches a real loopback track, so injecting here would be dead
  // code guarding against a case that cannot happen.
  if (systemAudioStrategy() !== 'virtual-source') return;

  const source = buildShimSource(DEVICE_LABEL);

  const inject = (): void => {
    contents
      .executeJavaScript(source, true)
      .then((result) => console.log(`[audio-shim] ${String(result)}`))
      .catch((err) => console.warn('[audio-shim] injection failed:', err));
  };

  contents.on('dom-ready', inject);
}
