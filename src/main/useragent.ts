/**
 * User-agent scrubbing.
 *
 * Why this matters for parity: Electron's default UA on this machine is
 *
 *   Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)
 *   Chrome/152.0.7977.78 Electron/44.4.0 Safari/537.36
 *
 * The `Electron/<version>` token (and, once `productName` is set, an
 * `<AppName>/<version>` token) are the only things separating it from a stock
 * Chrome UA. Web apps that sniff for Electron can degrade or refuse features on
 * that basis, so we strip those tokens and leave an otherwise untouched Chrome
 * UA — we do NOT fabricate a version, which would drift from the real Chromium
 * underneath and break feature detection in the other direction.
 */

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Removes the `Electron/...` token and any `<appName>/...` token from `ua`.
 * Collapses the whitespace left behind so the result stays a well-formed UA.
 */
export function scrubUserAgent(ua: string, appName: string): string {
  let out = ua.replace(/\s*Electron\/[^\s]+/gi, '');

  // `productName` can contain spaces/dots ("Scre.io"); escape before matching.
  const name = appName.trim();
  if (name) {
    out = out.replace(new RegExp(`\\s*${escapeRegExp(name)}\\/[^\\s]+`, 'gi'), '');
  }

  return out.replace(/\s{2,}/g, ' ').trim();
}
