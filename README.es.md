# Scre.io Desktop

**Español** · [English](README.md)

Wrapper de escritorio para [app.scre.io](https://app.scre.io/#/): un *site-specific
browser* basado en Electron que carga la app web en vivo y le agrega lo que un
navegador no puede dar en Linux.

> **Proyecto no oficial.** Este es un cliente de escritorio independiente y
> comunitario. **No está afiliado, respaldado ni mantenido por Scre.io** ni por
> sus autores. "Scre.io" y su logotipo son marcas y propiedad de sus respectivos
> dueños; aquí se usan únicamente para identificar el servicio al que se conecta
> la app.

## Aviso

- Es un wrapper: carga la web oficial (`app.scre.io`) en una ventana de Electron.
  **No copia, modifica ni reimplementa** el código ni los servidores de Scre.io, y
  no incluye nada de su backend.
- Todas las cuentas, grabaciones y datos se gestionan en el servicio oficial,
  bajo sus propios términos y política de privacidad.
- Si eres parte de Scre.io y prefieres que este repositorio cambie de nombre,
  de icono o se retire, abre un issue y se atenderá.
- Se ofrece "tal cual", sin garantías (ver [LICENSE](LICENSE)).

## Por qué existe

Ningún navegador en Linux puede grabar el audio del sistema. Ni Chrome ni
Firefox: `getDisplayMedia` no entrega pista de audio, y Scre.io responde con
*"Pista de audio del sistema no encontrada"*.

La limitación no es de PipeWire — tu máquina expone `…Speaker__sink.monitor`
perfectamente. Es que **Chromium filtra los dispositivos monitor** de
`enumerateDevices()`, así que la página no tiene de dónde elegir.

Un wrapper sí puede resolverlo, y esta app lo hace en dos piezas:

1. **`pw-loopback`** publica una fuente *real* (`media.class=Audio/Source`) a
   partir del sink por defecto. Al no ser un monitor, Chromium no la filtra.
2. **Un shim en el mundo principal de la página** parchea `getDisplayMedia`: si
   la plataforma no devolvió pista de audio, le engancha una tomada de esa
   fuente.

Resultado: el botón **"Sistema"** de Scre.io funciona sin tocar nada más. Y
**"Sistema + Mic."** también, porque Scre.io ya mezcla el micrófono por su
cuenta con WebAudio.

En Windows no hace falta nada de esto: ahí Electron soporta
`Streams.audio = 'loopback'` de forma nativa y la app usa ese camino.

## Requisitos del sistema

### Linux

| Componente | Para qué | Obligatorio |
|---|---|---|
| **PipeWire** (`pw-loopback`) | audio del sistema | no, pero sin él no hay audio de sistema |
| **xdg-desktop-portal** + backend (`-hyprland`, `-gtk`, `-kde`…) | selector de pantalla en Wayland | sí, en Wayland |
| **FUSE 2** | sólo para el AppImage | sólo AppImage |

En X11 no se usa el portal: la app muestra su propio selector con miniaturas.

### Windows

Nada adicional. El audio del sistema va por el loopback nativo de Electron.

## Instalación

```bash
# Arch / Manjaro / EndeavourOS
sudo pacman -U screenio-desktop-0.1.0.pacman

# Debian / Ubuntu / Pop!_OS / Mint
sudo dpkg -i screenio-desktop_0.1.0_amd64.deb

# Fedora / RHEL / openSUSE
sudo rpm -i screenio-desktop-0.1.0.x86_64.rpm

# Cualquier distro (requiere fuse2)
chmod +x Scre.io-0.1.0.AppImage && ./Scre.io-0.1.0.AppImage

# Cualquier distro, sin instalar
tar xzf screenio-desktop-0.1.0.tar.gz && ./screenio-desktop-0.1.0/scre-io
```

En Windows: descomprimir `Scre.io-0.1.0-win.zip` y ejecutar `Scre.io.exe`.

## Desarrollo

```bash
npm install
npm start        # compila y arranca
npm run dev      # igual, pero abre devtools
npm run typecheck
```

### Build

```bash
npm run dist          # Linux + Windows
npm run dist:linux
npm run dist:win
```

Los artefactos quedan en `release/`.

**Dependencias del build (en la máquina que compila):**

- `.rpm` necesita `rpmbuild` → `sudo pacman -S rpm-tools`
- el instalador `.exe` (NSIS) necesita `wine` → `sudo pacman -S wine`
- AppImage, `.deb`, `.pacman`, `.tar.gz` y el `.zip` de Windows no necesitan nada

## Arquitectura

```
src/main/       proceso principal
  index.ts        arranque, instancia única, ciclo de vida
  window.ts       ventana y ajustes de seguridad
  capture.ts      getDisplayMedia: portal en Wayland, selector propio en X11/Windows
  systemAudio.ts  ciclo de vida de pw-loopback
  audioShim.ts    parche de getDisplayMedia inyectado en la página
  picker.ts       ventana del selector de fuentes (X11/Windows)
  navigation.ts   enlaces externos al navegador del sistema
  shortcuts.ts    atajos de navegador
  offline.ts      página propia de reintento
  useragent.ts    limpieza del UA
src/preload/    superficies IPC mínimas (una para la app, otra para el selector)
src/renderer/   offline.html, picker.html
```

### Seguridad

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
`webSecurity: true`. El preload expone dos métodos y nada más; cada handler IPC
valida el origen del frame que llama. Verificado en runtime: `require`,
`process`, `module` e `ipcRenderer` son `undefined` en el contexto de la página.

## Limitaciones conocidas

**Una sola fuente por captura en Wayland.** PipeWire hace una única captura para
pantallas y ventanas. Si se piden ambos tipos, la fuente elegida vuelve tipada
como ventana. Es comportamiento documentado de Electron, no un error.

**La fuente de audio virtual es visible para todo el sistema.** Mientras la app
esté abierta, *"Scre.io System Audio"* aparece en la lista de micrófonos de
cualquier otra aplicación. Es inherente: para que Chromium la vea tiene que ser
una fuente real. Desaparece al cerrar la app.

**El WebM descargado no trae duración en la cabecera.** Es un defecto de
`MediaRecorder`, no del wrapper: muchos reproductores no permiten buscar dentro
del video. Scre.io lo compensa con su propio reproductor. Para arreglar el
archivo:

```bash
ffmpeg -i screen-capture.webm -c copy arreglado.webm
```

**Encoder por software.** El flag `AcceleratedVideoEncoder` habilita encode por
hardware (verificado: `video_encode` pasa de `disabled_software` a `enabled`), y
Scre.io graba en H264, que VCN de AMD encodea por hardware. Todavía no está
aplicado.

**VAAPI y NVIDIA.** En AMD e Intel el encode por hardware funciona con el driver
VAAPI del sistema. En NVIDIA hace falta `nvidia-vaapi-driver` y el soporte es
más irregular.

## Estado

Implementado y verificado: ventana y paridad de navegador, captura de pantalla,
audio del sistema, empaquetado.

**Pendiente:** handlers de permisos explícitos (hoy rigen los defaults
permisivos de Electron), gestión de descargas a carpeta configurable, bandeja
del sistema, atajos globales, ventana de preferencias y flags de Chromium.

## Troubleshooting

**No aparece el diálogo para elegir pantalla.** Verificá que el portal esté
corriendo:
```bash
ps aux | grep xdg-desktop-portal
```
En Hyprland hace falta `xdg-desktop-portal-hyprland`.

**No graba el audio del sistema.** Comprobá que la fuente virtual exista
mientras la app corre:
```bash
pactl list short sources | grep screio
```
Si no está, mirá que `pw-loopback` esté instalado (`which pw-loopback`). La app
avisa con una notificación si no pudo publicarla.

**El AppImage no arranca ("require FUSE").** Instalá FUSE 2
(`sudo pacman -S fuse2`) o usá el `.tar.gz`, que no lo necesita.

**Hyprland no agrupa la ventana con su lanzador.** Comprobá que la clase
coincida:
```bash
hyprctl clients -j | grep -i class
```
Debe decir `scre-io`, igual que el `StartupWMClass` del `.desktop`.

**Windows marca el ejecutable como no confiable.** Los binarios no están
firmados digitalmente. SmartScreen va a advertir en la primera ejecución.
