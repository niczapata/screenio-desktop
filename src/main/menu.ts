import { Menu } from 'electron';

/**
 * A menu that exists only to carry the standard editing accelerators.
 *
 * Electron's *default* menu would also expose reload and devtools in
 * production, which we do not want. But dropping the menu entirely
 * (`setApplicationMenu(null)`) is not free either: on Linux the editing roles
 * are what register Ctrl+C/V/X/A as application accelerators. So we install a
 * menu containing nothing but those roles, and keep it hidden
 * (`autoHideMenuBar`) so no menu bar is visible in a window that is meant to
 * look like a bare browser viewport.
 */
export function installHiddenEditMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
        ],
      },
    ]),
  );
}
