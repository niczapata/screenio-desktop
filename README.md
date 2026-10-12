# Scre.io Desktop

[Español](README.es.md) · **English**

Desktop wrapper for [app.scre.io](https://app.scre.io/#/): an Electron-based
*site-specific browser* that loads the live web app and adds what a browser
can't provide on Linux.

> **Unofficial project.** This is an independent, community-made desktop client.
> **It is not affiliated with, endorsed by, or maintained by Scre.io** or its
> authors. "Scre.io" and its logo are trademarks and property of their
> respective owners; they are used here only to identify the service the app
> connects to.

## Notice

- It is a wrapper: it loads the official web app (`app.scre.io`) in an Electron
  window. It **does not copy, modify, or reimplement** Scre.io's code or
  servers, and ships nothing from their backend.
- All accounts, recordings, and data are handled by the official service, under
  its own terms and privacy policy.
- If you represent Scre.io and would like this repository renamed, re-branded,
  or taken down, open an issue and it will be addressed.
- Provided "as is", without warranty (see [LICENSE](LICENSE)).

It does not modify or reimplement Scre.io. It is for personal use.

## Why it exists

No browser on Linux can record system audio. Neither Chrome nor Firefox:
`getDisplayMedia` returns no audio track, and Scre.io responds with
*"System audio track not found"*.

The limitation is not PipeWire's: a machine exposes `…Speaker__sink.monitor`
just fine. The problem is that **Chromium filters monitor devices** out of
`enumerateDevices()`, so the page has nothing to choose from.

A wrapper can solve it, and this app does so in two pieces:

1. **`pw-loopback`** publishes a *real* source (`media.class=Audio/Source`)
   from the default sink. Since it is not a monitor, Chromium doesn't filter it.
2. **A shim in the page's main world** patches `getDisplayMedia`: if the
   platform returned no audio track, it attaches one taken from that source.

Result: Scre.io's **"System"** button works with no further changes. So does
**"System + Mic."**, because Scre.io already mixes the microphone itself with
WebAudio.

On Windows none of this is needed: Electron natively supports
`Streams.audio = 'loopback'` there, and the app uses that path.

## System requirements

### Linux

| Component | Purpose | Required |
|---|---|---|
| **PipeWire** (`pw-loopback`) | system audio | no, but without it there is no system audio |
| **xdg-desktop-portal** + backend (`-hyprland`, `-gtk`, `-kde`…) | screen picker on Wayland | yes, on Wayland |
| **FUSE 2** | AppImage only | AppImage only |

On X11 the portal is not used: the app shows its own picker with thumbnails.

### Windows

Nothing extra. System audio goes through Electron's native loopback.

## Installation

```bash
# Arch / Manjaro / EndeavourOS
sudo pacman -U screenio-desktop-0.1.0.pacman

# Debian / Ubuntu / Pop!_OS / Mint
sudo dpkg -i screenio-desktop_0.1.0_amd64.deb

# Fedora / RHEL / openSUSE
sudo rpm -i screenio-desktop-0.1.0.x86_64.rpm

# Any distro (requires fuse2)
chmod +x Scre.io-0.1.0.AppImage && ./Scre.io-0.1.0.AppImage

# Any distro, no install
tar xzf screenio-desktop-0.1.0.tar.gz && ./screenio-desktop-0.1.0/scre-io
```

On Windows: unzip `Scre.io-0.1.0-win.zip` and run `Scre.io.exe`.

## Development

```bash
npm install
npm start        # build and launch
npm run dev      # same, but opens devtools
npm run typecheck
```

### Build

```bash
npm run dist          # Linux + Windows
npm run dist:linux
npm run dist:win
```

Artifacts end up in `release/`.

**Build dependencies (on the machine that builds):**

- `.rpm` needs `rpmbuild` → `sudo pacman -S rpm-tools`
- the `.exe` installer (NSIS) needs `wine` → `sudo pacman -S wine`
- AppImage, `.deb`, `.pacman`, `.tar.gz`, and the Windows `.zip` need nothing

## Architecture

```
src/main/       main process
  index.ts        startup, single instance, lifecycle
  window.ts       window and security settings
  capture.ts      getDisplayMedia: portal on Wayland, own picker on X11/Windows
  systemAudio.ts  pw-loopback lifecycle
  audioShim.ts    getDisplayMedia patch injected into the page
  picker.ts       source picker window (X11/Windows)
  navigation.ts   external links to the system browser
  shortcuts.ts    browser shortcuts
  offline.ts      own retry page
  useragent.ts    UA cleanup
src/preload/    minimal IPC surfaces (one for the app, one for the picker)
src/renderer/   offline.html, picker.html
```

### Security

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
`webSecurity: true`. The preload exposes two methods and nothing else; each IPC
handler validates the origin of the calling frame. Verified at runtime:
`require`, `process`, `module`, and `ipcRenderer` are `undefined` in the page
context.

## Known limitations

**Only one source per capture on Wayland.** PipeWire does a single capture for
screens and windows. If both types are requested, the chosen source comes back
typed as a window. This is documented Electron behavior, not a bug.

**The virtual audio source is visible system-wide.** While the app is open,
*"Scre.io System Audio"* appears in the microphone list of any other
application. This is inherent: for Chromium to see it, it has to be a real
source. It disappears when the app closes.

**The downloaded WebM has no duration in its header.** This is a
`MediaRecorder` defect, not the wrapper's: many players can't seek within the
video. Scre.io compensates with its own player. To fix the file:

```bash
ffmpeg -i screen-capture.webm -c copy fixed.webm
```

**Software encoder.** The `AcceleratedVideoEncoder` flag enables hardware
encoding (verified: `video_encode` goes from `disabled_software` to `enabled`),
and Scre.io records H264, which AMD's VCN encodes in hardware. Not applied yet.

**VAAPI and NVIDIA.** On AMD and Intel, hardware encoding works with the
system's VAAPI driver. On NVIDIA you need `nvidia-vaapi-driver` and support is
patchier.

## Status

Implemented and verified: window and browser parity, screen capture, system
audio, packaging.

**Pending:** explicit permission handlers (currently Electron's permissive
defaults apply), downloads to a configurable folder, system tray, global
shortcuts, preferences window, and Chromium flags.

## Troubleshooting

**The screen-selection dialog doesn't appear.** Check that the portal is
running:
```bash
ps aux | grep xdg-desktop-portal
```
On Hyprland you need `xdg-desktop-portal-hyprland`.

**System audio isn't recorded.** Check that the virtual source exists while the
app is running:
```bash
pactl list short sources | grep screio
```
If it isn't there, make sure `pw-loopback` is installed (`which pw-loopback`).
The app shows a notification if it couldn't publish it.

**The AppImage won't start ("require FUSE").** Install FUSE 2
(`sudo pacman -S fuse2`) or use the `.tar.gz`, which doesn't need it.

**Hyprland doesn't group the window with its launcher.** Check that the class
matches:
```bash
hyprctl clients -j | grep -i class
```
It must say `scre-io`, the same as the `.desktop` file's `StartupWMClass`.

**Windows flags the executable as untrusted.** The binaries are not digitally
signed. SmartScreen will warn on first run.
