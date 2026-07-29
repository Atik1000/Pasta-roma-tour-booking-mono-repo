'use client';

import * as React from 'react';

import { Button, Card, CardContent } from '@pasta/ui';
import { isApiClientError } from '@pasta/api-client';
import { useMutation } from '@tanstack/react-query';
import { Upload, X } from 'lucide-react';

import { adminApi } from '@/lib/session';

/**
 * Tour gallery.
 *
 * Files upload as soon as they are chosen — the API returns a URL, and that URL
 * is what the editor holds. Order is display order and the first image is the
 * cover, so removing the first one promotes the next.
 *
 * Persistence differs by mode: an existing tour writes the list straight away,
 * while a tour that has not been created yet has nowhere to attach images, so
 * the editor flushes the list once the tour exists.
 */
export function TourGalleryPanel({
  tourId,
  gallery,
  onChange,
}: {
  tourId?: string;
  gallery: string[];
  onChange: (next: string[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const results = [];
      // Sequential, so the gallery order matches the order they were picked.
      for (const file of files) {
        results.push(await adminApi.admin.uploadImage(file));
      }
      return results.map((result) => result.url);
    },
    onSuccess: (urls) => {
      setError(null);
      const next = [...gallery, ...urls];
      onChange(next);
      if (tourId) persist.mutate(next);
    },
    onError: (caught: unknown) => {
      setError(isApiClientError(caught) ? caught.message : 'That upload failed. Please try again.');
    },
  });

  const persist = useMutation({
    mutationFn: (urls: string[]) => adminApi.admin.setTourImages(tourId!, urls),
    onError: (caught: unknown) => {
      setError(
        isApiClientError(caught) ? caught.message : 'Could not save the gallery. Please try again.',
      );
    },
  });

  function remove(index: number) {
    const next = gallery.filter((_, position) => position !== index);
    onChange(next);
    if (tourId) persist.mutate(next);
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Tour Gallery</h2>

        {error ? (
          <p role="alert" className="text-danger-foreground mb-3 text-sm">
            {error}
          </p>
        ) : null}

        <ul className="flex flex-wrap gap-3">
          {gallery.map((url, index) => (
            <li key={url} className="relative">
              {/* Uploads are arbitrary user URLs, so the Next image loader is
                  bypassed here in favour of a plain img. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={index === 0 ? 'Cover image' : `Gallery image ${index + 1}`}
                className="rounded-field bg-muted block h-24 w-36 object-cover"
              />
              {index === 0 ? (
                <span className="bg-cream-900/70 absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-white">
                  Cover
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`Remove gallery image ${index + 1}`}
                onClick={() => remove(index)}
                className="bg-cream-900/70 hover:bg-danger focus-visible:outline-ring absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}

          <li>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
              className="rounded-field border-border text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-ring flex h-24 w-36 flex-col items-center justify-center gap-1.5 border border-dashed text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
            >
              <Upload className="size-5" aria-hidden />
              {upload.isPending ? 'Uploading…' : 'Add Photos'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              className="sr-only"
              aria-label="Choose gallery images"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) upload.mutate(files);
                // Reset so choosing the same file twice still fires a change.
                event.target.value = '';
              }}
            />
          </li>
        </ul>

        <p className="text-muted-foreground mt-3 text-xs">
          You can upload multiple images. Recommended size: 1920x1080px. Max 10MB per image.
          {tourId ? null : ' Images are attached when you first save the tour.'}
        </p>

        {tourId && gallery.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            isLoading={persist.isPending}
            onClick={() => persist.mutate(gallery)}
          >
            {persist.isSuccess && !persist.isPending ? 'Saved' : 'Save Gallery Order'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
