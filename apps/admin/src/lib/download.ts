/**
 * Hands a fetched Blob to the browser as a file.
 *
 * These documents sit behind a bearer token, so a plain anchor href cannot
 * reach them — the blob is fetched with the session's credentials and then
 * given an object URL, which is revoked immediately afterwards so the buffer
 * is not held for the life of the tab.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

/**
 * Opens a PDF in a new tab and asks it to print.
 *
 * Kept separate from `saveBlob` because "Print Invoice" should reach the print
 * dialog rather than drop a file in Downloads. The object URL is revoked on a
 * timer rather than immediately: revoking it before the new window has read the
 * document leaves a blank tab.
 */
export function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const preview = window.open(url, '_blank', 'noopener');

  if (preview) {
    preview.addEventListener('load', () => preview.print(), { once: true });
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
