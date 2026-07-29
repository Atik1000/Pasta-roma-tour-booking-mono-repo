/**
 * Hands a fetched Blob to the browser as a file.
 *
 * Ticket and invoice PDFs are gated by the signed lookup token, and putting
 * that token in an anchor href would leak it into browser history and the
 * Referer header — so the document is fetched by the SDK and saved from memory
 * instead. The object URL is revoked straight after the click.
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
