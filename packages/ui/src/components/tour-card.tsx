import * as React from 'react';

import type { CurrencyCode } from '@pasta/types';
import { formatDuration, formatPriceFrom } from '@pasta/utils';
import { Clock, MapPin, Star } from 'lucide-react';

import { cn } from '../lib/cn';
import { Badge } from './badge';
import { Button } from './button';

export interface TourCardProps {
  title: string;
  location: string;
  durationHours: number;
  priceMinor: number;
  currency?: CurrencyCode;
  description?: string;
  imageUrl?: string;
  isBestseller?: boolean;
  /** Rendered as the card's image — lets apps pass `next/image`. */
  image?: React.ReactNode;
  /** Wraps the whole card, e.g. a `next/link`. */
  renderLink?: (children: React.ReactNode) => React.ReactNode;
  /** Shows the "View Details" button (listing grid) instead of a bare card (carousel). */
  showAction?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * The tour card used on the landing carousel and the tours grid.
 *
 * The listing variant carries a "View Details" button; the carousel variant is
 * a plain card whose whole surface is the link.
 */
export function TourCard({
  title,
  location,
  durationHours,
  priceMinor,
  currency = 'EUR',
  description,
  imageUrl,
  isBestseller,
  image,
  renderLink,
  showAction = false,
  actionLabel = 'View Details',
  onAction,
  className,
}: TourCardProps) {
  const body = (
    <article
      className={cn(
        'rounded-card border-border bg-card shadow-card group flex h-full flex-col overflow-hidden border transition-all',
        'hover:shadow-elevated hover:-translate-y-0.5',
        className,
      )}
    >
      <div className="bg-muted relative aspect-[16/10] overflow-hidden">
        {image ??
          (imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : null)}

        {isBestseller ? (
          <Badge tone="solid" className="absolute left-3 top-3">
            <Star className="size-3" aria-hidden />
            Bestseller
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-display text-balance text-lg font-semibold leading-snug">{title}</h3>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden />
            {location}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden />
            {formatDuration(durationHours)}
          </span>
        </div>

        {description ? (
          <p className="text-muted-foreground line-clamp-2 text-sm">{description}</p>
        ) : null}

        <div className="border-border mt-auto flex items-center justify-between gap-3 border-t pt-4">
          <span className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground text-xs">From</span>
            <span className="font-display text-primary text-xl font-semibold">
              {formatPriceFrom(priceMinor, currency)}
            </span>
          </span>

          {showAction ? (
            <Button variant="outline" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );

  return renderLink ? renderLink(body) : body;
}
