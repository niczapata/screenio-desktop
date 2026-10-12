import { Notification } from 'electron';

/**
 * Warnings that describe a standing platform limitation rather than a
 * per-recording event. Firing these on every capture would train the user to
 * dismiss them without reading, so each fires once per app run.
 */
const shown = new Set<string>();

function once(key: string, title: string, body: string): void {
  if (shown.has(key)) return;
  shown.add(key);

  if (!Notification.isSupported()) {
    console.warn(`[notify] ${title}: ${body}`);
    return;
  }
  new Notification({ title, body, urgency: 'normal' }).show();
}

/**
 * Fired only when the virtual source failed to come up. In the normal case
 * system audio works (systemAudio.ts publishes a PipeWire source and
 * audioShim.ts wires it into getDisplayMedia), so this is a real fault report
 * rather than a standing platform limitation — and it carries the reason,
 * because "not found" with no explanation is what the bare web app already
 * shows.
 */
export function warnSystemAudioUnavailable(reason: string | null): void {
  once(
    'system-audio',
    'No se pudo capturar el audio del sistema',
    (reason ?? 'La fuente de audio virtual no está disponible.') +
      ' La grabación va a salir sin esa pista; el micrófono no está afectado.',
  );
}
