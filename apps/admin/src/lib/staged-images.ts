'use client';

import * as React from 'react';

/** Mirrors the API's own limits, so a bad file is caught before a round trip. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(',');

export interface StagedImage {
  id: string;
  file: File;
  /** An object URL — a local preview, no network involved. */
  previewUrl: string;
}

let sequence = 0;

/**
 * Files chosen but not yet uploaded.
 *
 * Picking an image used to fire the upload immediately, so the first sight of
 * it was whatever came back from the server — and a wrong file meant uploading
 * it, then deleting it. Staging shows the picture straight from disk and waits
 * for a deliberate Upload.
 *
 * Object URLs hold the file in memory until revoked, so every path that drops
 * a staged image revokes it, and the unmount does the same for the rest.
 */
export function useStagedImages() {
  const [staged, setStaged] = React.useState<StagedImage[]>([]);
  const [rejected, setRejected] = React.useState<string | null>(null);

  // A ref, so unmount cleanup does not re-run every time the list changes.
  const latest = React.useRef(staged);
  latest.current = staged;

  React.useEffect(
    () => () => latest.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)),
    [],
  );

  const add = React.useCallback((files: File[]) => {
    const tooBig: string[] = [];
    const wrongType: string[] = [];

    const accepted = files.filter((file) => {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        wrongType.push(file.name);
        return false;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        tooBig.push(file.name);
        return false;
      }
      return true;
    });

    const problems = [
      wrongType.length
        ? `${wrongType.join(', ')} — only JPG, PNG, WebP and AVIF are accepted.`
        : '',
      tooBig.length ? `${tooBig.join(', ')} — larger than 10MB.` : '',
    ].filter(Boolean);

    setRejected(problems.length ? problems.join(' ') : null);

    if (accepted.length === 0) return;

    setStaged((current) => [
      ...current,
      ...accepted.map((file) => ({
        id: `staged-${(sequence += 1)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  const remove = React.useCallback((id: string) => {
    setStaged((current) => {
      const going = current.find((item) => item.id === id);
      if (going) URL.revokeObjectURL(going.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const clear = React.useCallback(() => {
    setStaged((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setRejected(null);
  }, []);

  return { staged, rejected, add, remove, clear };
}
