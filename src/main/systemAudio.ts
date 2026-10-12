import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { systemAudioStrategy } from '../shared/constants';
import path from 'node:path';

/**
 * System audio capture on Linux.
 *
 * The problem: no browser on Linux can hand a page the system audio. Chromium
 * has no loopback path for getDisplayMedia here (Electron's `audio: 'loopback'`
 * is documented Windows-only), and Firefox does not offer it either. The
 * limitation is not PipeWire's — the machine exposes
 * `…Speaker__sink.monitor` perfectly well — it is that Chromium filters monitor
 * devices out of `enumerateDevices()`, so there is nothing for a page to pick.
 *
 * What a wrapper can do that a browser cannot: create a *real* source. A
 * `pw-loopback` bridge reading the default sink and publishing itself as
 * `media.class=Audio/Source` is not a monitor as far as Chromium is concerned,
 * so it appears as an ordinary audio input. Measured on this machine: the
 * device shows up in `enumerateDevices()` and carries signal (-18 dB against a
 * -91 dB noise floor).
 *
 * Why a child process rather than `pactl load-module module-remap-source`: a
 * loaded module outlives the app. If we crashed, the user would be left with a
 * phantom input device and no obvious way to connect it back to us. A child
 * process dies with the app, and writes nothing to their audio configuration.
 *
 * Note `stream.capture.sink=true` with no `target.object`: this follows the
 * *default* sink, so switching from speakers to headphones keeps working
 * without restarting anything.
 */

/** Node name in the PipeWire graph. Internal. */
const NODE_NAME = 'screio_system_audio';

/**
 * Human-readable name. This is the string the page sees as the device label,
 * so the renderer shim matches on it — keep the two in sync.
 */
export const DEVICE_LABEL = 'Scre.io System Audio';

const CAPTURE_PROPS = 'stream.capture.sink=true';
const PLAYBACK_PROPS =
  `media.class=Audio/Source node.name=${NODE_NAME} node.description="${DEVICE_LABEL}"`;

let proc: ChildProcess | null = null;
let unavailableReason: string | null = null;

/** Locates `pw-loopback` on PATH without shelling out. */
function findBinary(name: string): string | null {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

export function isRunning(): boolean {
  return proc !== null && proc.exitCode === null && !proc.killed;
}

/** Why system audio is unavailable, or null if it is fine. */
export function getUnavailableReason(): string | null {
  return unavailableReason;
}

/**
 * Publishes the virtual source. Safe to call repeatedly. Returns false when
 * system audio will not be available, leaving a reason in
 * `getUnavailableReason()` for the preferences UI to show.
 */
export function startSystemAudioSource(): boolean {
  if (isRunning()) return true;

  // pw-loopback is PipeWire, i.e. Linux. Other platforms either have a native
  // path (Windows) or none at all, and neither wants a child process here.
  if (systemAudioStrategy() !== 'virtual-source') {
    unavailableReason = null;
    return false;
  }

  const bin = findBinary('pw-loopback');
  if (!bin) {
    unavailableReason =
      'No se encontró pw-loopback. Instalá el paquete pipewire (incluye pw-loopback) para poder grabar el audio del sistema.';
    console.warn(`[system-audio] ${unavailableReason}`);
    return false;
  }

  try {
    proc = spawn(bin, ['--capture-props=' + CAPTURE_PROPS, '--playback-props=' + PLAYBACK_PROPS], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Detached would survive us — exactly what we are trying to avoid.
      detached: false,
    });
  } catch (err) {
    unavailableReason = `No se pudo iniciar pw-loopback: ${String(err)}`;
    console.error(`[system-audio] ${unavailableReason}`);
    proc = null;
    return false;
  }

  proc.stderr?.on('data', (d: Buffer) => console.warn(`[system-audio] ${d.toString().trim()}`));

  proc.on('exit', (code, signal) => {
    // A clean SIGTERM is us shutting down; anything else is a real failure and
    // the user should not silently lose system audio because of it.
    if (signal !== 'SIGTERM' && code !== 0) {
      unavailableReason = `pw-loopback terminó inesperadamente (code=${code}, signal=${signal}).`;
      console.error(`[system-audio] ${unavailableReason}`);
    }
    proc = null;
  });

  unavailableReason = null;
  console.log(`[system-audio] virtual source "${DEVICE_LABEL}" published`);
  return true;
}

/** Removes the virtual source. Called on quit; idempotent. */
export function stopSystemAudioSource(): void {
  if (!proc) return;
  const p = proc;
  proc = null;
  try {
    p.kill('SIGTERM');
  } catch {
    // already gone
  }
}
