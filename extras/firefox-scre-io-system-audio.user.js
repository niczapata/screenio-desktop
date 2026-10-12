// ==UserScript==
// @name         Scre.io — audio del sistema en Firefox (Linux)
// @namespace    local.screio.systemaudio
// @version      1.0
// @description  Hace que el botón "Sistema" de Scre.io funcione en Firefox sobre Linux, enganchando la pista de audio desde el monitor de PipeWire.
// @match        https://app.scre.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * POR QUÉ HACE FALTA
 *
 * Scre.io, al elegir "Sistema", llama:
 *
 *     getDisplayMedia({ video: true, audio: true })
 *
 * y después verifica (código real de su bundle):
 *
 *     const e = n.getAudioTracks();
 *     if (0 === e.length) throw new Error("audioTracks length is zero");
 *
 * Firefox en Linux nunca devuelve pista de audio por getDisplayMedia — no es
 * una preferencia apagada, simplemente no está implementado. La verificación
 * falla y aparece "Pista de audio del sistema no encontrada".
 *
 * Este script deja que la llamada real ocurra (el portal para elegir pantalla
 * sale igual que siempre) y, si la plataforma no puso audio, engancha una
 * pista tomada del monitor de PipeWire.
 *
 * A diferencia del wrapper Electron equivalente, acá NO hace falta pw-loopback:
 * Firefox ya expone los dispositivos "Monitor of ..." en enumerateDevices(),
 * cosa que Chromium filtra.
 *
 *
 * IMPORTANTE: @grant none
 *
 * Es obligatorio. Con cualquier @grant, Violentmonkey/Tampermonkey corren el
 * script en un sandbox con un `window` envuelto, y el parche no llegaría al
 * código de la página. Con `none` corre en el contexto real de la página.
 *
 *
 * SI TENÉS VARIAS SALIDAS DE AUDIO
 *
 * Por defecto toma el primer dispositivo cuyo nombre empiece con "Monitor of".
 * Si tenés varias salidas (parlantes y HDMI, por ejemplo) y agarra la que no
 * es, poné abajo un fragmento del nombre de la que querés.
 */

// Viene pre-configurado a tu salida por defecto. Importante: Firefox enumera
// primero "Monitor of Renoir/Cezanne HDMI/DP Audio Controller Pro" (HDMI), que
// NO es por donde suena tu audio — dejarlo vacío engancharía una pista muda.
// Si cambiás de salida (auriculares, HDMI), ajustá o vaciá este valor.
const PREFERIDO = 'Ryzen HD Audio Controller Speaker';

(() => {
  const md = navigator.mediaDevices;
  if (!md || typeof md.getDisplayMedia !== 'function') return;

  const real = md.getDisplayMedia.bind(md);

  const esMonitor = (d) =>
    d.kind === 'audioinput' &&
    /^Monitor of/i.test(d.label) &&
    (!PREFERIDO || d.label.includes(PREFERIDO));

  async function buscarMonitor() {
    let hallado = (await md.enumerateDevices()).find(esMonitor);
    if (hallado) return hallado.deviceId;

    // Los labels están ocultos hasta que se concede permiso de micrófono.
    // Lo pedimos una vez, miramos de nuevo, y soltamos ese stream temporal.
    let temp = null;
    try {
      temp = await md.getUserMedia({ audio: true });
      hallado = (await md.enumerateDevices()).find(esMonitor);
    } catch {
      return null;
    } finally {
      if (temp) temp.getTracks().forEach((t) => t.stop());
    }
    return hallado ? hallado.deviceId : null;
  }

  md.getDisplayMedia = async function (constraints) {
    const queriaAudio = !!(constraints && constraints.audio);
    const stream = await real(constraints);

    if (!queriaAudio) return stream;

    // Si algún día Firefox implementa audio acá, el script se aparta solo.
    if (stream.getAudioTracks().length > 0) return stream;

    try {
      const deviceId = await buscarMonitor();
      if (!deviceId) {
        console.warn('[scre.io userscript] no encontré ningún dispositivo "Monitor of ..."');
        return stream;
      }

      const sys = await md.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          // Es un loopback digital limpio, no un micrófono en una sala.
          // El procesamiento de voz arruinaría el audio del programa.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const track = sys.getAudioTracks()[0];
      if (!track) return stream;
      stream.addTrack(track);

      // Al cortar la compartición de pantalla, soltar también el audio.
      const video = stream.getVideoTracks()[0];
      if (video) video.addEventListener('ended', () => track.stop(), { once: true });

      console.log('[scre.io userscript] audio del sistema enganchado');
    } catch (err) {
      // Ante cualquier fallo devolvemos el stream intacto: Scre.io mostrará el
      // mismo error que muestra hoy, nunca algo peor.
      console.warn('[scre.io userscript] no pude enganchar el audio:', err);
    }

    return stream;
  };
})();
