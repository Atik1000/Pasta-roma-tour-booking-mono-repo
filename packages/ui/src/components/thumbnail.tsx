'use client';

import * as React from 'react';

import { cn } from '../lib/cn';

export interface ThumbnailProps {
  /** Cover image URL, or null when the record has no photo yet. */
  src: string | null | undefined;
  /** What the image shows — the tour or post title. */
  alt: string;
  className?: string;
}

/**
 * The small cover image the admin listings show beside a title.
 *
 * Uploads are arbitrary user URLs served by the API, so this uses a plain `img`
 * rather than the Next image loader.
 *
 * A record with no photo — or one whose URL no longer resolves — falls back to
 * the brand gradient. The fallback matters: these tiles used to be gradients
 * unconditionally, and swapping in real images without it would turn a dead
 * link into a browser broken-image icon, which reads as a bug rather than as
 * "no picture yet".
 */
export function Thumbnail({ src, alt, className }: ThumbnailProps) {
  const [failed, setFailed] = React.useState(false);

  // A new src deserves a fresh attempt; without this, one dead image would keep
  // the fallback showing after the row was replaced by a different record.
  React.useEffect(() => setFailed(false), [src]);

  const shape = cn('rounded-field block shrink-0 object-cover', className);

  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={`${alt} (no image)`}
        className={cn(shape, 'bg-[linear-gradient(140deg,#f3ddb8,#e3b76f_55%,#b5751f)]')}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(shape, 'bg-muted')}
    />
  );
}
